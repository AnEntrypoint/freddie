import { contentHasImage, LlmError, offloadRequestImagesWithPolicy, requestImageHandleText } from '@freddie/freddie-llm'

const TOOL_RESULT_IMAGE_TEXT = 'Attached image(s) from tool result:'

function reasoningEffort(effort) {
  if (effort === 'off' || effort === 'low' || effort === 'high' || effort === 'max') {
    return effort
  }
  throw new LlmError(
    `DeepSeek does not support reasoning effort "${effort}"`,
    'UNSUPPORTED_REASONING_EFFORT',
  )
}

function resolveThinking(options, defaults) {
  if (options.purpose === 'session-title') return { thinking: 'disabled' }
  const effort = options.reasoningEffort === undefined
    ? defaults.reasoningEffort
    : reasoningEffort(options.reasoningEffort)
  if (defaults.thinking === 'disabled' && effort !== undefined && effort !== 'off') {
    throw new LlmError(
      `DeepSeek deployment does not support reasoning effort "${effort}"`,
      'UNSUPPORTED_REASONING_EFFORT',
    )
  }
  if (effort === 'off') return { thinking: 'disabled' }
  if (effort === 'low' || effort === 'high' || effort === 'max') {
    return { thinking: 'enabled', reasoningEffort: effort }
  }
  return defaults.thinking === undefined ? {} : { thinking: defaults.thinking }
}

function flattenText(blocks) {
  return blocks
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

function assertTextOnly(blocks) {
  if (contentHasImage(blocks)) {
    throw new LlmError('The DeepSeek chat-completions adapter does not support image content.', 'UNSUPPORTED_CONTENT')
  }
}

function assertSupportedImageRoles(messages) {
  for (const message of messages) {
    if (message.role !== 'user' && contentHasImage(message.content)) {
      throw new LlmError(
        `The DeepSeek chat-completions adapter cannot represent image content in a ${message.role} message.`,
        'UNSUPPORTED_CONTENT',
      )
    }
  }
}

function imageHandle(version, precededByContent) {
  return {
    type: 'text',
    text: `${precededByContent ? '\n' : ''}${requestImageHandleText(version)}`,
  }
}

async function imageParts(block, images, location, precededByContent) {
  const version = images.requestImages.get(block.attachment.attachmentId)
  if (version === undefined) {
    throw new LlmError(
      `DeepSeek request image ${block.attachment.attachmentId} was not prepared.`,
      'INVALID_REQUEST',
    )
  }
  const image = images.representation.kind === 'file'
    ? { type: 'file', file_id: await images.representation.resolveFileId(version, block, location) }
    : {
      type: 'image_url',
      image_url: { url: `data:${version.mediaType};base64,${Buffer.from(version.data).toString('base64')}` },
    }
  return [imageHandle(version, precededByContent), image]
}

async function contentParts(blocks, images, message, nextImage) {
  const parts = []
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        if (block.text.length > 0) parts.push({ type: 'text', text: block.text })
        break
      case 'image':
        nextImage.value += 1
        parts.push(...await imageParts(block, images, { message, image: nextImage.value }, parts.length > 0))
        break
      case 'tool-result':
        parts.push(...await contentParts(block.content, images, message, nextImage))
        break
      default:
        break
    }
  }
  return parts
}

function userContent(parts) {
  const text = []
  for (const part of parts) {
    if (part.type !== 'text') return [...parts]
    text.push(part.text)
  }
  return text.join('')
}

function serializeAssistant(message) {
  const text = flattenText(message.content)
  const reasoning = message.content
    .filter(block => block.type === 'reasoning')
    .map(block => block.text)
    .join('')
  const toolCalls = message.content
    .filter(block => block.type === 'tool-call')
    .map(block => ({
      id: block.id,
      type: 'function',
      function: { name: block.name, arguments: block.arguments },
    }))

  return {
    role: 'assistant',
    content: text,
    ...reasoning.length > 0 ? { reasoning_content: reasoning } : {},
    ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {},
  }
}

export function serializeMessages(messages) {
  const wire = []
  for (const message of messages) {
    assertTextOnly(message.content)
    if (message.role === 'system') {
      wire.push({ role: 'system', content: flattenText(message.content) })
      continue
    }
    if (message.role === 'assistant') {
      wire.push(serializeAssistant(message))
      continue
    }
    const toolResults = message.content.filter(block => block.type === 'tool-result')
    const text = flattenText(message.content)
    if (text.length > 0 || toolResults.length === 0) {
      wire.push({ role: 'user', content: text })
    }
    for (const result of toolResults) {
      wire.push({
        role: 'tool',
        tool_call_id: result.toolCallId,
        content: flattenText(result.content) || '(no output)',
      })
    }
  }
  return wire
}

export async function serializeMessagesWithImages(messages, images) {
  assertSupportedImageRoles(messages)
  const wire = []
  let pendingToolImages = []
  const flushToolImages = () => {
    if (pendingToolImages.length === 0) return
    wire.push({
      role: 'user',
      content: [{ type: 'text', text: TOOL_RESULT_IMAGE_TEXT }, ...pendingToolImages],
    })
    pendingToolImages = []
  }

  for (const [messageIndex, message] of messages.entries()) {
    const nextImage = { value: 0 }
    if (message.role === 'system') {
      flushToolImages()
      wire.push({ role: 'system', content: flattenText(message.content) })
      continue
    }
    if (message.role === 'assistant') {
      flushToolImages()
      wire.push(serializeAssistant(message))
      continue
    }

    const regular = message.content.filter(block => block.type !== 'tool-result')
    const toolResults = message.content.filter(block => block.type === 'tool-result')
    const content = userContent(await contentParts(regular, images, messageIndex + 1, nextImage))
    if (content.length > 0 || toolResults.length === 0) {
      flushToolImages()
      wire.push({
        role: 'user',
        content,
      })
    }
    for (const result of toolResults) {
      const parts = await contentParts(result.content, images, messageIndex + 1, nextImage)
      const imageParts = parts.filter(part => part.type !== 'text')
      const text = parts.filter(part => part.type === 'text').map(part => part.text).join('')
      wire.push({
        role: 'tool',
        tool_call_id: result.toolCallId,
        content: text || '(no output)',
      })
      pendingToolImages.push(...imageParts)
    }
  }
  flushToolImages()
  return wire
}

function requestWithMessages(options, messages, defaults) {
  const tools = options.tools?.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
  const resolvedThinking = resolveThinking(options, defaults)
  return {
    model: options.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...resolvedThinking.thinking !== undefined ? { thinking: { type: resolvedThinking.thinking } } : {},
    ...resolvedThinking.reasoningEffort !== undefined
      ? { reasoning_effort: resolvedThinking.reasoningEffort }
      : {},
    ...tools !== undefined && tools.length > 0 ? { tools } : {},
    ...options.temperature !== undefined ? { temperature: options.temperature } : {},
    ...options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens },
    ...options.stop !== undefined ? { stop: options.stop } : {},
  }
}

export function serializeRequest(options, defaults = {}) {
  const messages = []
  if (options.system !== undefined) {
    messages.push({ role: 'system', content: options.system })
  }
  messages.push(...serializeMessages(options.messages))

  return requestWithMessages(options, messages, defaults)
}

export async function serializeRequestWithImages(options, images, defaults = {}) {
  assertSupportedImageRoles(options.messages)
  const requestMessages = offloadRequestImagesWithPolicy(options.messages, {
    representation: images.representation.kind === 'file' ? 'raw' : 'base64',
    byteLength: (ref) => {
      const version = images.requestImages.get(ref.attachmentId)
      if (version === undefined) {
        throw new LlmError(`DeepSeek request image ${ref.attachmentId} was not prepared.`, 'INVALID_REQUEST')
      }
      return version.bytes
    },
    maxBytes: images.maxRequestImageBytes,
    ...images.maxImagesPerRequest === undefined ? {} : { maxImages: images.maxImagesPerRequest },
    ...images.byteQuantum === undefined ? {} : { byteQuantum: images.byteQuantum },
    ...images.countQuantum === undefined ? {} : { countQuantum: images.countQuantum },
  })
  const messages = []
  if (options.system !== undefined) {
    messages.push({ role: 'system', content: options.system })
  }
  messages.push(...await serializeMessagesWithImages(requestMessages, images))
  return requestWithMessages(options, messages, defaults)
}
