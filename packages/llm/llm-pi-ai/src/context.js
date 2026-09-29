/**
 * Harness request-history conversion into pi-ai's Context vocabulary.
 *
 * The harness keeps tool results as `tool-result` blocks nested inside user
 * messages and has no `tool` role, so one user message may produce several
 * pi-ai messages: accumulated text and image content becomes a `user` message,
 * and each `tool-result` block becomes its own `toolResult` message.
 * @module @freddie/freddie-llm-pi-ai/context
 */

import {
  contentHasImage,
  LlmError,
  offloadRequestImagesWithPolicy,
  requestImageHandleText,
} from '@freddie/freddie-llm'
import { toPiAssistant } from './replay.js'
import { DEFAULT_REQUEST_IMAGE_MAX_BYTES, DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET } from './config.js'

/**
 * Join the text blocks of a harness message.
 * @param {object} message - one request message.
 * @returns {string} its concatenated text.
 */
function flattenText(message) {
  return message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/** Reject images outside user messages, which pi-ai can only carry there. */
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

/**
 * Convert one harness content list into pi-ai user content.
 * @param {readonly object[]} blocks - harness content blocks.
 * @param {ReadonlyMap<string, object>} requestImages - resolved request image versions by attachment id.
 * @returns {string | object[]} the pi-ai user content.
 */
function userContent(blocks, requestImages) {
  /** @type {object[]} */
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

/**
 * Collect every represented image reference, walking nested tool results.
 * @param {readonly object[]} blocks - harness content blocks.
 * @param {Map<string, object>} refs - collector keyed by attachment id.
 * @returns {void}
 */
function collectImageRefs(blocks, refs) {
  for (const block of blocks) {
    if (block.type === 'image') refs.set(block.attachment.attachmentId, block.attachment)
    else if (block.type === 'tool-result') collectImageRefs(block.content, refs)
  }
}

/**
 * Resolve one deterministic request image per represented attachment.
 * @param {readonly object[]} messages - request history.
 * @param {object} attachments - durable attachment store.
 * @param {{ maxPixels: number, maxBytes: number }} policy - route pixel and byte budgets.
 * @param {AbortSignal} [signal] - caller cancellation.
 * @returns {Promise<Map<string, object>>} the request image versions by attachment id.
 */
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

/**
 * Convert harness tool schemas to pi-ai tools. `ToolSchema.parameters` is a
 * JSON Schema object and pi-ai's `TSchema` is structurally JSON Schema.
 * @param {object} options - the harness request.
 * @returns {object[] | undefined} the pi-ai tools, or undefined when none are declared.
 */
function toolsOf(options) {
  return options.tools?.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }))
}

/**
 * Select the pi-ai `systemPrompt` source shared by both conversion paths.
 * `options.system` wins when defined; otherwise a leading `system` history
 * message supplies it and leaves the converted history.
 * @param {object} options - the harness request.
 * @returns {{ systemPrompt: string | undefined, messages: readonly object[] }} the split.
 */
function splitSystemPrompt(options) {
  if (options.system !== undefined) return { systemPrompt: options.system, messages: options.messages }
  const [first, ...rest] = options.messages
  if (first?.role !== 'system') return { systemPrompt: undefined, messages: options.messages }
  const text = flattenText(first)
  return { systemPrompt: text.length > 0 ? text : undefined, messages: rest }
}

/**
 * Assemble the request-level pi-ai context envelope.
 * @param {string | undefined} systemPrompt - text for pi-ai's single system slot.
 * @param {object} options - the harness request.
 * @param {object[]} messages - converted pi-ai messages.
 * @returns {object} the pi-ai context.
 */
function piContext(systemPrompt, options, messages) {
  const tools = toolsOf(options)
  return {
    ...systemPrompt !== undefined ? { systemPrompt } : {},
    messages,
    ...tools !== undefined && tools.length > 0 ? { tools } : {},
  }
}

/**
 * Append one assistant message, recording the tool-call names that later tool
 * results need.
 * @param {object} message - the harness assistant message.
 * @param {object[]} messages - collector.
 * @param {Map<string, string>} toolNames - tool-call id to name.
 * @param {(reason: string) => void} [onReplayDegrade] - replay-degradation observer.
 * @returns {void}
 */
function appendAssistant(message, messages, toolNames, onReplayDegrade) {
  const assistant = toPiAssistant(message, onReplayDegrade)
  for (const block of assistant.content) {
    if (block.type === 'toolCall') toolNames.set(block.id, block.name)
  }
  messages.push(assistant)
}

/**
 * Append a system or assistant message, which both context builders treat
 * identically; a system message that did not supply the prompt folds into a
 * user message to preserve order.
 * @param {object} message - the harness message.
 * @param {object[]} messages - collector.
 * @param {Map<string, string>} toolNames - tool-call id to name.
 * @param {(reason: string) => void} [onReplayDegrade] - replay-degradation observer.
 * @returns {boolean} whether the message was consumed.
 */
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

/**
 * Flush accumulated user content as one pi-ai user message.
 * @param {object[]} pending - accumulated pi-ai content parts.
 * @param {object[]} messages - collector.
 * @returns {void}
 */
function flushUser(pending, messages) {
  if (pending.length === 0) return
  const content = pending.every(part => part.type === 'text')
    ? pending.map(part => part.text).join('')
    : [...pending]
  messages.push({ role: 'user', content, timestamp: 0 })
  pending.length = 0
}

/**
 * Convert one harness user message into pi-ai messages, splitting nested tool
 * results out into their own messages.
 * @param {object} message - the harness user message.
 * @param {ReadonlyMap<string, object>} requestImages - resolved request image versions.
 * @param {object[]} messages - collector.
 * @param {Map<string, string>} toolNames - tool-call id to name.
 * @returns {void}
 */
function appendUser(message, requestImages, messages, toolNames) {
  /** @type {object[]} */
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

/**
 * Build the pi-ai message list from harness history.
 * @param {readonly object[]} history - harness history after the system split.
 * @param {ReadonlyMap<string, object>} requestImages - resolved request image versions.
 * @param {(reason: string) => void} [onReplayDegrade] - replay-degradation observer.
 * @returns {object[]} the pi-ai messages.
 */
function convertMessages(history, requestImages, onReplayDegrade) {
  const toolNames = new Map()
  /** @type {object[]} */
  const messages = []
  for (const message of history) {
    if (appendSystemOrAssistant(message, messages, toolNames, onReplayDegrade)) continue
    appendUser(message, requestImages, messages, toolNames)
  }
  return messages
}

/**
 * Inputs that bind deterministic request images to one request.
 * @typedef {object} PiImageRequestContext
 * @property {object} attachments Durable provider that resolves request-image bytes.
 * @property {number} [maxRequestImageBytes] Request-level bound on retained base64 image payload.
 * @property {{ maxPixels: number, maxBytes: number }} [requestImagePolicy] Route pixel and byte budgets.
 */

/**
 * Convert text-only harness history to a synchronous pi-ai Context.
 * @param {object} options - the harness request.
 * @param {(reason: string) => void} [onReplayDegrade] - forwarded to `toPiAssistant`.
 * @returns {object} the pi-ai context.
 */
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

/**
 * Convert harness history to a pi-ai Context while resolving durable images.
 * When the retained occurrences' base64 payload exceeds `maxRequestImageBytes`,
 * the oldest images are replaced by text placeholders until the request fits.
 * @param {object} options - the harness request.
 * @param {PiImageRequestContext} images - attachment provider and request limits.
 * @param {(reason: string) => void} [onReplayDegrade] - forwarded to `toPiAssistant`.
 * @returns {Promise<object>} the asynchronously resolved pi-ai context.
 */
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

/**
 * Convert harness history into a pi-ai Context.
 * @param {object} options - the harness request.
 * @param {PiImageRequestContext} [images] - attachment provider and request limits; omission selects text-only conversion.
 * @param {(reason: string) => void} [onReplayDegrade] - forwarded to `toPiAssistant`.
 * @returns {object | Promise<object>} the pi-ai context.
 */
export function toPiContext(options, images, onReplayDegrade) {
  return images === undefined
    ? textOnlyContext(options, onReplayDegrade)
    : toPiContextWithImages(options, images, onReplayDegrade)
}
