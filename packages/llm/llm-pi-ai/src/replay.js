/**
 * Durable pi-ai replay metadata and assistant-history reconstruction.
 *
 * Harness content remains the durable source for text and tool calls. This
 * module stores only the provider-native metadata needed to reconstruct a
 * pi-ai assistant message on a later request.
 * @module @freddie/freddie-llm-pi-ai/replay
 */

import { LlmError } from '@freddie/freddie-llm'

/** Parse tool-call argument JSON; tolerate model malformations with {}. */
function parseArguments(raw) {
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed
  } catch {
    return {}
  }
  return {}
}

const NEVER_A_CATALOG_API = 'freddie-foreign'

/** Construct the zero usage value required by historical pi-ai messages. */
function emptyPiUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

/**
 * Project a successful pi-ai response into the minimal durable replay state.
 * The per-block half is index-aligned with the streamed blocks (pi-ai content
 * order), so `BlockAssembler` prunes an entry with its block whenever assembly
 * removes one.
 * @param {object} message - completed native pi-ai assistant response.
 * @param {string} [requestedModel] - request identity stored in the assistant source.
 * @returns {{ response: object, blocks: object[] }} the versioned lossless-JSON replay projection.
 */
export function toPiReplayState(message, requestedModel = message.model) {
  const responseModel = message.api === 'anthropic-messages' && message.model !== requestedModel
    ? message.model : message.responseModel
  const response = {
    kind: 'pi-ai',
    version: 2,
    api: message.api,
    provider: message.provider,
    model: requestedModel,
    ...responseModel === undefined ? {} : { responseModel },
    ...message.responseId === undefined ? {} : { responseId: message.responseId },
    ...message.providerThinkingLevel === undefined ? {} : { providerThinkingLevel: message.providerThinkingLevel },
    stopReason: message.stopReason,
  }
  return {
    response,
    blocks: message.content.map((block) => {
      switch (block.type) {
        case 'text': return {
          type: 'text',
          ...block.textSignature === undefined ? {} : { textSignature: block.textSignature },
        }
        case 'thinking': return {
          type: 'reasoning',
          ...block.thinkingSignature === undefined ? {} : { thinkingSignature: block.thinkingSignature },
          ...block.redacted === undefined ? {} : { redacted: block.redacted },
        }
        case 'toolCall': return {
          type: 'tool-call',
          ...block.thoughtSignature === undefined ? {} : { thoughtSignature: block.thoughtSignature },
        }
        default: return { type: 'text' }
      }
    }),
  }
}

/**
 * @param {string} message - what is wrong with the replay state.
 * @returns {never}
 */
function invalidReplay(message) {
  throw new LlmError(`invalid pi-ai replay state: ${message}`, 'INVALID_REPLAY_STATE')
}

/** Validate the durable adapter-private envelope before it reaches pi-ai. */
function readReplayState(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalidReplay('expected a replay envelope')
  const envelope = value
  const rawResponse = envelope['response']
  if (typeof rawResponse !== 'object' || rawResponse === null || Array.isArray(rawResponse)) return invalidReplay('expected a response object')
  const response = rawResponse
  if (response['kind'] !== 'pi-ai') return invalidReplay('unknown state kind')
  if (response['version'] !== 2) return invalidReplay(`unsupported version ${String(response['version'])}`)
  for (const key of ['api', 'provider', 'model']) {
    if (typeof response[key] !== 'string' || response[key].length === 0) return invalidReplay(`${key} must be a non-empty string`)
  }
  if (!['stop', 'length', 'toolUse', 'error', 'aborted'].includes(String(response['stopReason']))) {
    return invalidReplay('unknown stopReason')
  }
  if (response['responseModel'] !== undefined && typeof response['responseModel'] !== 'string') return invalidReplay('responseModel must be a string')
  if (response['responseId'] !== undefined && typeof response['responseId'] !== 'string') return invalidReplay('responseId must be a string')
  if (response['providerThinkingLevel'] !== undefined && typeof response['providerThinkingLevel'] !== 'string') return invalidReplay('providerThinkingLevel must be a string')
  const blocks = envelope['blocks']
  if (!Array.isArray(blocks)) return invalidReplay('blocks must be an array')
  for (const [index, value] of blocks.entries()) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalidReplay(`block ${index} must be an object`)
    const block = value
    if (!['text', 'reasoning', 'tool-call'].includes(String(block['type']))) return invalidReplay(`block ${index} has an unknown type`)
    for (const signature of ['textSignature', 'thinkingSignature', 'thoughtSignature']) {
      if (block[signature] !== undefined && typeof block[signature] !== 'string') return invalidReplay(`block ${index} ${signature} must be a string`)
    }
    if (block['redacted'] !== undefined && typeof block['redacted'] !== 'boolean') return invalidReplay(`block ${index} redacted must be boolean`)
  }
  return { response, blocks }
}

/**
 * Convert provider-neutral blocks without trusting them as same-model replay.
 * @param {object} message - durable harness assistant message.
 * @returns {object} a native pi-ai assistant message with no replay metadata.
 */
function foreignAssistant(message) {
  const source = message.source
  /** @type {object[]} */
  const content = []
  for (const block of message.content) {
    switch (block.type) {
      case 'text': content.push({ type: 'text', text: block.text }); break
      case 'reasoning': content.push({ type: 'thinking', thinking: block.text }); break
      case 'tool-call': content.push({
        type: 'toolCall',
        id: block.id,
        name: block.name,
        arguments: parseArguments(block.arguments),
      }); break
      case 'image':
        throw new LlmError('pi-ai chat history cannot represent structured assistant image output', 'UNSUPPORTED_CONTENT')
      default:
        break
    }
  }
  return {
    role: 'assistant',
    content,
    api: NEVER_A_CATALOG_API,
    provider: source.provider,
    model: source.model,
    usage: emptyPiUsage(),
    stopReason: content.some(piece => piece.type === 'toolCall') ? 'toolUse' : 'stop',
    timestamp: 0,
  }
}

/**
 * Recombine durable harness content with validated pi-ai replay metadata.
 * @param {object} message - durable harness assistant message.
 * @param {object} source - its model message source.
 * @param {unknown} rawState - the stored replay envelope.
 * @returns {object} a native pi-ai assistant message reconstructed from durable content.
 */
function replayedAssistant(message, source, rawState) {
  const state = readReplayState(rawState)
  if (state.response.provider !== source.provider) return invalidReplay('provider does not match assistant source')
  if (state.response.model !== source.model) return invalidReplay('model does not match assistant source')
  if (state.blocks.length !== message.content.length) return invalidReplay('block count does not match assistant content')
  const content = message.content.map((block, index) => {
    const replay = state.blocks[index]
    if (replay === undefined || replay.type !== block.type) return invalidReplay(`block ${index} does not match assistant content`)
    switch (block.type) {
      case 'text': return {
        type: 'text',
        text: block.text,
        ...replay.type === 'text' && replay.textSignature !== undefined ? { textSignature: replay.textSignature } : {},
      }
      case 'reasoning': return {
        type: 'thinking',
        thinking: block.text,
        ...replay.type === 'reasoning' && replay.thinkingSignature !== undefined ? { thinkingSignature: replay.thinkingSignature } : {},
        ...replay.type === 'reasoning' && replay.redacted !== undefined ? { redacted: replay.redacted } : {},
      }
      case 'tool-call': return {
        type: 'toolCall',
        id: block.id,
        name: block.name,
        arguments: parseArguments(block.arguments),
        ...replay.type === 'tool-call' && replay.thoughtSignature !== undefined ? { thoughtSignature: replay.thoughtSignature } : {},
      }
      default: return invalidReplay(`block ${index} has an unsupported harness type`)
    }
  })
  const anthropicReportsAliasesAsModel = state.response.api === 'anthropic-messages'
  return {
    role: 'assistant',
    content,
    api: state.response.api,
    provider: state.response.provider,
    model: anthropicReportsAliasesAsModel
      ? state.response.responseModel ?? state.response.model : state.response.model,
    ...state.response.responseModel === undefined ? {} : { responseModel: state.response.responseModel },
    ...state.response.responseId === undefined ? {} : { responseId: state.response.responseId },
    ...state.response.providerThinkingLevel === undefined ? {} : { providerThinkingLevel: state.response.providerThinkingLevel },
    usage: emptyPiUsage(),
    stopReason: state.response.stopReason,
    timestamp: 0,
  }
}

/**
 * Convert one durable harness assistant message into pi-ai history.
 *
 * Durable content is the authoritative record; replay metadata only restores
 * native fidelity (ids, signatures). A replay state this build cannot use
 * degrades the one message to provider-neutral history instead of failing the
 * request.
 * @param {object} message - model-produced assistant content with provider, model, and optional replay metadata.
 * @param {(reason: string) => void} [onDegrade] - called with the diagnostic reason when an unusable replay state falls back.
 * @returns {object} a native pi-ai assistant message reconstructed from durable content.
 */
export function toPiAssistant(message, onDegrade) {
  const source = message.source
  if (source.replayState === undefined) return foreignAssistant(message)
  try {
    return replayedAssistant(message, source, source.replayState)
  } catch (error) {
    if (!(error instanceof LlmError) || error.code !== 'INVALID_REPLAY_STATE') throw error
    onDegrade?.(error.message)
    return foreignAssistant(message)
  }
}
