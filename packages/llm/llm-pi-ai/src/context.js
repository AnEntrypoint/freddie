import {
  contentHasImage,
  LlmError,
  offloadRequestImagesWithPolicy,
  requestImageHandleText,
} from '@freddie/freddie-llm'
import { toPiAssistant } from './replay.js'
import { DEFAULT_REQUEST_IMAGE_MAX_BYTES, DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET } from './config.js'

function flattenText(message) {
  return message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

function assertSupportedHistory(messages) {
  for (const message of messages) {
    if (message.role !== 'user' && contentHasImage(message.content)) {
      throw new LlmError(
        `pi-ai cannot represent an image in an in-history ${message.role} message`,
        'UNSUPPORTED_CONTENT',
      )
    }
  }
}

function userContent(blocks, requestImages) {
  const content = []
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        if (block.text.length > 0) content.push({ type: 'text', text: block.text })
        break
      case 'image': {
        const version = requestImages.get(block.attachment.attachmentId)
        content.push({ type: 'text', text: requestImageHandleText(version) })
        content.push({
          type: 'image',
          data: Buffer.from(version.data).toString('base64'),
          mimeType: version.mediaType,
        })
        break
      }
      default:
        break
    }
  }
  if (content.every(block => block.type === 'text')) return content.map(block => block.text).join('')
  return content
}

function collectImageRefs(blocks, refs) {
  for (const block of blocks) {
    if (block.type === 'image') refs.set(block.attachment.attachmentId, block.attachment)
    else if (block.type === 'tool-result') collectImageRefs(block.content, refs)
  }
}

async function prepareRequestImages(messages, attachments, policy, signal) {
  const refs = new Map()
  for (const message of messages) collectImageRefs(message.content, refs)
  const orderedRefs = [...refs.values()]
  const prepared = await Promise.all(orderedRefs.map(
    ref => attachments.readImageRequest(ref, policy, signal),
  ))
  const versions = new Map()
  for (const [index, ref] of orderedRefs.entries()) versions.set(ref.attachmentId, prepared[index])
  return versions
}

function toolsOf(options) {
  return options.tools?.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }))
}

function splitSystemPrompt(options) {
  if (options.system !== undefined) return { systemPrompt: options.system, messages: options.messages }
  const [first, ...rest] = options.messages
  if (first?.role !== 'system') return { systemPrompt: undefined, messages: options.messages }
  const text = flattenText(first)
  return { systemPrompt: text.length > 0 ? text : undefined, messages: rest }
}

function piContext(systemPrompt, options, messages) {
  const tools = toolsOf(options)
  return {
    ...systemPrompt !== undefined ? { systemPrompt } : {},
    messages,
    ...tools !== undefined && tools.length > 0 ? { tools } : {},
  }
}

function appendAssistant(message, messages, toolNames, onReplayDegrade) {
  const assistant = toPiAssistant(message, onReplayDegrade)
  for (const block of assistant.content) {
    if (block.type === 'toolCall') toolNames.set(block.id, block.name)
  }
  messages.push(assistant)
}

function appendSystemOrAssistant(message, messages, toolNames, onReplayDegrade) {
  if (message.role === 'system') {
    messages.push({ role: 'user', content: flattenText(message), timestamp: 0 })
    return true
  }
  if (message.role === 'assistant') {
    appendAssistant(message, messages, toolNames, onReplayDegrade)
    return true
  }
  return false
}

function flushUser(pending, messages) {
  if (pending.length === 0) return
  const content = pending.every(part => part.type === 'text')
    ? pending.map(part => part.text).join('')
    : [...pending]
  messages.push({ role: 'user', content, timestamp: 0 })
  pending.length = 0
}

function appendUser(message, requestImages, messages, toolNames) {
  const pending = []
  for (const block of message.content) {
    if (block.type === 'tool-result') {
      flushUser(pending, messages)
      messages.push({
        role: 'toolResult',
        toolCallId: block.toolCallId,
        toolName: toolNames.get(block.toolCallId) ?? 'unknown',
        content: userContent(block.content, requestImages),
        isError: block.isError ?? false,
        timestamp: 0,
      })
      continue
    }
    if (block.type === 'text') {
      if (block.text.length > 0) pending.push({ type: 'text', text: block.text })
      continue
    }
    if (block.type === 'image') {
      const version = requestImages.get(block.attachment.attachmentId)
      pending.push({ type: 'text', text: requestImageHandleText(version) })
      pending.push({
        type: 'image',
        data: Buffer.from(version.data).toString('base64'),
        mimeType: version.mediaType,
      })
    }
  }
  flushUser(pending, messages)
}

function convertMessages(history, requestImages, onReplayDegrade) {
  const toolNames = new Map()
  const messages = []
  for (const message of history) {
    if (appendSystemOrAssistant(message, messages, toolNames, onReplayDegrade)) continue
    appendUser(message, requestImages, messages, toolNames)
  }
  return messages
}

function textOnlyContext(options, onReplayDegrade) {
  assertSupportedHistory(options.messages)
  const split = splitSystemPrompt(options)
  for (const message of split.messages) {
    if (contentHasImage(message.content)) {
      throw new LlmError('pi-ai image conversion requires the durable attachment service', 'UNSUPPORTED_CONTENT')
    }
  }
  return piContext(split.systemPrompt, options, convertMessages(split.messages, new Map(), onReplayDegrade))
}

async function toPiContextWithImages(options, images, onReplayDegrade) {
  const { attachments, maxRequestImageBytes } = images
  const requestImagePolicy = images.requestImagePolicy ?? {
    maxPixels: DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET,
    maxBytes: DEFAULT_REQUEST_IMAGE_MAX_BYTES,
  }
  assertSupportedHistory(options.messages)
  const split = splitSystemPrompt(options)
  const requestImages = await prepareRequestImages(split.messages, attachments, requestImagePolicy, options.signal)
  const projected = offloadRequestImagesWithPolicy(split.messages, {
    representation: 'base64',
    ...maxRequestImageBytes === undefined ? {} : { maxBytes: maxRequestImageBytes },
    byteQuantum: 1,
    byteLength: ref => requestImages.get(ref.attachmentId)?.bytes ?? ref.bytes,
  })
  return piContext(split.systemPrompt, options, convertMessages(projected, requestImages, onReplayDegrade))
}

export function toPiContext(options, images, onReplayDegrade) {
  return images === undefined
    ? textOnlyContext(options, onReplayDegrade)
    : toPiContextWithImages(options, images, onReplayDegrade)
}
