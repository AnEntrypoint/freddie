/**
 * pi-ai assistant event translation into the harness streaming protocol.
 *
 * pi-ai tool-call arguments are parsed objects while the harness keeps their
 * raw JSON representation. pi-ai also reports failures as terminal stream
 * events, which this module maps into harness finish chunks.
 * @module @freddie/freddie-llm-pi-ai/stream
 */

import { isContextOverflow } from '@earendil-works/pi-ai/utils/overflow'
import {
  CallId,
  CONTEXT_WINDOW_EXCEEDED_CODE,
  EMPTY_RESPONSE_CODE,
  isContextWindowExceededError,
  isQuotaExceededError,
  LlmError,
  QUOTA_EXCEEDED_CODE,
} from '@freddie/freddie-llm'
import { toPiReplayState } from './replay.js'

/**
 * Map pi-ai usage (reasoning folded into output by pi-ai).
 * @param {object} usage - cumulative usage from the terminal pi-ai event.
 * @returns {object} harness counts with pi-ai's exact total; cache fields appear only when non-zero.
 */
export function mapUsage(usage) {
  return {
    inputTokens: usage.input,
    outputTokens: usage.output,
    totalTokens: usage.totalTokens,
    ...usage.cacheRead > 0 ? { cacheReadTokens: usage.cacheRead } : {},
    ...usage.cacheWrite > 0 ? { cacheWriteTokens: usage.cacheWrite } : {},
  }
}

/** A request body a gateway or provider refused for size; resending it cannot succeed, so it is invalid, not transient. */
const REJECTED_REQUEST_BODY = /\b413\b|failed to buffer the request body:\s*length limit exceeded|payload too large|request body too large/i

/** A stream truncated before the provider's terminal event; each pi-ai provider words this differently when the wire closes mid-response. */
const STREAM_TRUNCATED_BEFORE_TERMINAL_EVENT = /stream ended (?:before|without)\b/i

/**
 * The raw argument string the harness vocabulary keeps; pi-ai hands back the parsed object.
 * @param {{ arguments: unknown }} toolCall - the pi-ai tool call.
 * @returns {string} the serialized arguments.
 */
function rawArgumentsOf(toolCall) {
  return JSON.stringify(toolCall.arguments)
}

/**
 * Whether a terminal stop produced no content blocks: a degenerate provider
 * completion rather than a successful, empty assistant message.
 * @param {object} message - the assistant message carried by the terminal event.
 * @returns {boolean} true when the message has no content.
 */
function isDegenerateCompletion(message) {
  return message.content.length === 0
}

/**
 * pi-ai flattens the caught error to `error.message`, discarding the original
 * Error and its `cause` chain before it reaches us, so classification reads
 * terse words rather than codes.
 * @param {string} message - the flattened provider failure text.
 * @returns {string} the harness error code.
 */
function classifyPiAiError(message) {
  if (/\b(?:401|403)\b/.test(message)) return 'AUTH'
  if (isQuotaExceededError(message)) return QUOTA_EXCEEDED_CODE
  if (/\b429\b|rate.?limit/i.test(message)) return 'RATE_LIMIT'
  if (REJECTED_REQUEST_BODY.test(message)) return 'INVALID_REQUEST'
  if (/\b400\b|invalid.?request/i.test(message)) return 'INVALID_REQUEST'
  if (/\b5\d\d\b/.test(message)) return 'SERVER'
  if (/\btime(?:d)?\s*out\b|timeout/i.test(message)) return 'TIMEOUT'
  if (STREAM_TRUNCATED_BEFORE_TERMINAL_EVENT.test(message)) return 'TRANSPORT'
  if (/\b(?:network|connection|socket|fetch)\b|\bECONN[A-Z]+\b/i.test(message)
    || /\b(?:other side closed|HTTP2 request did not get a response|WebSocket closed unexpectedly)\b/i.test(message)
    || /\bterminated\b|premature close/i.test(message)) {
    return 'TRANSPORT'
  }
  return 'PI_AI_ERROR'
}

/**
 * Map a terminal pi-ai event to the harness finish reason.
 * @param {object} message - the assistant message carried by the `done` or `error` event.
 * @param {number} [contextWindow] - resolved catalog capacity for usage-based overflow detection.
 * @returns {object} the mapped harness reason.
 */
export function mapStopReason(message, contextWindow) {
  const piAiOverflow = isContextOverflow(message, contextWindow)
  const harnessOverflow = message.stopReason === 'error'
    && message.errorMessage !== undefined
    && isContextWindowExceededError(message.errorMessage)
  if (piAiOverflow || harnessOverflow) {
    return {
      kind: 'error',
      failure: {
        message: message.errorMessage ?? `pi-ai detected context overflow for model "${message.model}"`,
        code: CONTEXT_WINDOW_EXCEEDED_CODE,
      },
    }
  }

  switch (message.stopReason) {
    case 'stop':
      if (isDegenerateCompletion(message)) {
        return {
          kind: 'error',
          failure: {
            message: `model "${message.model}" returned a completed response with no content`,
            code: EMPTY_RESPONSE_CODE,
          },
        }
      }
      return { kind: 'stop' }
    case 'length': return { kind: 'max-tokens' }
    case 'toolUse': return { kind: 'tool-calls' }
    case 'pending': return {
      kind: 'error',
      failure: { message: `pi-ai stream for model "${message.model}" ended pending`, code: 'PI_AI_ERROR' },
    }
    case 'deferred': return {
      kind: 'error',
      failure: { message: `pi-ai deferred response for model "${message.model}" is not supported`, code: 'PI_AI_ERROR' },
    }
    case 'aborted': return {
      kind: 'aborted',
      failure: { message: message.errorMessage ?? 'pi-ai stream aborted', code: 'ABORTED' },
    }
    case 'error': {
      const text = message.errorMessage ?? 'pi-ai stream error'
      return { kind: 'error', failure: { message: text, code: classifyPiAiError(text) } }
    }
    default: return {
      kind: 'error',
      failure: { message: `pi-ai stream for model "${message.model}" ended with unknown stop reason`, code: 'PI_AI_ERROR' },
    }
  }
}

/**
 * Translate the pi-ai event stream into stream chunks. pi-ai never throws
 * mid-stream — failures arrive as `error` events, which become error/aborted
 * `finish` chunks.
 * @param {AsyncIterable<object>} events - one assistant turn's pi-ai event stream.
 * @param {number} [contextWindow] - resolved catalog capacity for usage-based overflow detection.
 * @param {AbortSignal} [callerSignal] - caller cancellation state.
 * @param {string} [requestedModel] - request model identity recorded for durable replay.
 * @returns {AsyncGenerator<object>} the harness chunks, ending with `usage` then `finish`.
 */
export async function* toStreamChunks(events, contextWindow, callerSignal, requestedModel) {
  const toolIds = new Map()

  for await (const event of events) {
    switch (event.type) {
      case 'start':
        break
      case 'text_start':
        yield { type: 'block-start', index: event.contentIndex, blockType: 'text' }
        break
      case 'text_delta':
        yield { type: 'text-delta', index: event.contentIndex, text: event.delta }
        break
      case 'text_end':
        yield { type: 'block-end', index: event.contentIndex, block: { type: 'text', text: event.content } }
        break
      case 'thinking_start':
        yield { type: 'block-start', index: event.contentIndex, blockType: 'reasoning' }
        break
      case 'thinking_delta':
        yield { type: 'reasoning-delta', index: event.contentIndex, text: event.delta }
        break
      case 'thinking_end':
        yield { type: 'block-end', index: event.contentIndex, block: { type: 'reasoning', text: event.content } }
        break
      case 'toolcall_start': {
        const partial = event.partial.content[event.contentIndex]
        const id = partial?.type === 'toolCall' ? partial.id : ''
        const name = partial?.type === 'toolCall' ? partial.name : ''
        toolIds.set(event.contentIndex, { id, name })
        yield { type: 'block-start', index: event.contentIndex, blockType: 'tool-call' }
        break
      }
      case 'toolcall_delta': {
        const known = toolIds.get(event.contentIndex)
        yield {
          type: 'tool-call-delta',
          index: event.contentIndex,
          id: CallId(known?.id ?? ''),
          ...known?.name !== undefined && known.name.length > 0 ? { name: known.name } : {},
          argumentsDelta: event.delta,
        }
        break
      }
      case 'toolcall_end':
        yield {
          type: 'block-end',
          index: event.contentIndex,
          block: {
            type: 'tool-call',
            id: CallId(event.toolCall.id),
            name: event.toolCall.name,
            arguments: rawArgumentsOf(event.toolCall),
          },
        }
        break
      case 'done':
        yield { type: 'usage', usage: mapUsage(event.message.usage) }
        yield {
          type: 'finish',
          reason: mapStopReason(event.message, contextWindow),
          replayState: toPiReplayState(event.message, requestedModel),
        }
        return
      case 'error':
        yield { type: 'usage', usage: mapUsage(event.error.usage) }
        yield {
          type: 'finish',
          reason: mapStopReason(
            callerSignal?.aborted ? { ...event.error, stopReason: 'aborted' } : event.error,
            contextWindow,
          ),
        }
        return
      default:
        break
    }
  }
  throw new LlmError('pi-ai event stream ended without done/error', 'STREAM_CLOSED')
}
