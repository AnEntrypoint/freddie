
import { isImageAdmissionError } from '@freddie/freddie-attachment'

const IMAGE_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]

const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export class AcpContentError extends Error {
  constructor(message, kind, options) {
    super(message, options)
    this.name = 'AcpContentError'
    this.kind = kind
  }
}

function imageMediaType(value) {
  return IMAGE_MEDIA_TYPES.includes(value) ? value : undefined
}

function decodeImage(block) {
  const mediaType = imageMediaType(block.mimeType)
  if (mediaType === undefined) {
    throw new AcpContentError('image mimeType must be image/png, image/jpeg, image/webp, or image/gif', 'invalid')
  }
  if (!CANONICAL_BASE64.test(block.data)) {
    throw new AcpContentError('image data must be canonical base64', 'invalid')
  }
  const data = Buffer.from(block.data, 'base64')
  if (data.toString('base64') !== block.data) {
    throw new AcpContentError('image data must be canonical base64', 'invalid')
  }
  return { data, mediaType }
}

async function assertImageRoute(ctx, agent, signal) {
  const routed = agent.session.requestHeader()?.config
  const provider = routed?.provider ?? agent.options.provider
  const model = routed?.model ?? agent.options.model
  const llm = ctx.get('llm')
  if (provider === undefined || model === undefined || llm === undefined) {
    throw new AcpContentError('the current model route could not be resolved for image input', 'invalid')
  }
  let info
  try {
    info = await llm.resolveModelInfo(provider, model, signal)
  } catch (error) {
    throw new AcpContentError('the current model route could not be verified for image input', 'internal', { cause: error })
  }
  if (info.inputModalities === undefined || !info.inputModalities.includes('image')) {
    throw new AcpContentError(`model "${model}" does not declare image input`, 'invalid')
  }
}

export async function supportsAcpImagePrompts(
  ctx,
  provider,
  model,
) {
  const attachments = ctx.get('attachments')
  const llm = ctx.get('llm')
  if (attachments === undefined || llm === undefined || provider === undefined || model === undefined) return false
  if (!attachments.imageLimits.mediaTypes.some(mediaType => IMAGE_MEDIA_TYPES.includes(mediaType))) return false
  try {
    const info = await llm.resolveModelInfo(provider, model)
    return info.inputModalities?.includes('image') === true
  } catch {
    return false
  }
}

function resourceLinkText(block) {
  return `\n[resource_link name=${JSON.stringify(block.name)} uri=${JSON.stringify(block.uri)}]\n`
}

export async function admitAcpPrompt(
  ctx,
  agent,
  prompt,
  imageEnabled,
  signal,
) {
  const images = []
  for (const block of prompt) {
    switch (block.type) {
      case 'text':
      case 'resource_link':
        break
      case 'image':
        if (!imageEnabled) throw new AcpContentError('inline image prompts were not advertised by this connection', 'invalid')
        images.push(decodeImage(block))
        break
      case 'audio':
        throw new AcpContentError('audio prompt content is not supported', 'invalid')
      case 'resource':
        throw new AcpContentError('embedded resource prompt content is not supported', 'invalid')
      default:
        throw new AcpContentError('unsupported ACP prompt content', 'invalid')
    }
  }

  let refs = []
  if (images.length > 0) {
    const attachments = ctx.get('attachments')
    if (attachments === undefined) throw new AcpContentError('no attachment store is mounted', 'invalid')
    await assertImageRoute(ctx, agent, signal)
    signal.throwIfAborted()
    try {
      refs = await attachments.saveImages(images)
    } catch (error) {
      if (isImageAdmissionError(error)) {
        throw new AcpContentError(error.message, 'invalid', { cause: error })
      }
      throw new AcpContentError('unable to persist the prompt image batch', 'internal', { cause: error })
    }
    signal.throwIfAborted()
  }

  const content = []
  let pendingText = ''
  let imageIndex = 0
  const flushText = () => {
    if (pendingText.length === 0) return
    content.push({ type: 'text', text: pendingText })
    pendingText = ''
  }
  for (const block of prompt) {
    switch (block.type) {
      case 'text':
        pendingText += block.text
        break
      case 'resource_link':
        pendingText += resourceLinkText(block)
        break
      case 'image': {
        flushText()
        const ref = refs[imageIndex++]
        content.push({ type: 'image', attachment: ref })
        break
      }
      case 'audio':
      case 'resource':
        break
      default:
        break
    }
  }
  flushText()
  if (!content.some(block => block.type === 'image' || (block.type === 'text' && block.text.trim().length > 0))) {
    throw new AcpContentError('empty prompt', 'invalid')
  }
  return content
}

export async function assistantBlockToAcp(
  ctx,
  block,
) {
  if (block.type === 'text') {
    return block.text.length === 0 ? undefined : { type: 'text', text: block.text }
  }
  if (block.type !== 'image') return undefined
  const attachments = ctx.get('attachments')
  if (attachments === undefined) {
    throw new AcpContentError('cannot deliver assistant image: no attachment store is mounted', 'internal')
  }
  let stored
  try {
    stored = await attachments.readImage(block.attachment)
  } catch (error) {
    throw new AcpContentError('cannot deliver assistant image: the attachment is unavailable or corrupt', 'internal', { cause: error })
  }
  return {
    type: 'image',
    data: Buffer.from(stored.data).toString('base64'),
    mimeType: stored.ref.mediaType,
  }
}
