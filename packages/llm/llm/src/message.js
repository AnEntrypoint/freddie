import { MessageId } from './brand.js'
import { deepFreeze } from './call-config.js'

export const CONTEXT_SUMMARY_MAX_CHARS = 120

export function boundContextSummary(summary) {
  return summary.length <= CONTEXT_SUMMARY_MAX_CHARS
    ? summary
    : `${summary.slice(0, CONTEXT_SUMMARY_MAX_CHARS - 1)}…`
}

export function freezeMessage(message) {
  return deepFreeze(structuredClone(message))
}

export function createMessage(input) {
  return freezeMessage({
    ...input,
    id: MessageId(crypto.randomUUID()),
  })
}

export function createUserMessage(input) {
  return createMessage({
    ...input,
    role: 'user',
  })
}

export function createAssistantMessage(input) {
  return createMessage({
    role: 'assistant',
    content: input.content,
    source: {
      kind: 'model',
      ...input.source,
    },
  })
}

export function createToolResultMessage(input) {
  return createUserMessage({
    source: { kind: 'tool', callId: input.callId },
    content: [{
      type: 'tool-result',
      toolCallId: input.callId,
      content: input.content,
      isError: input.isError,
    }],
  })
}

export function isTokenDelta(chunk) {
  switch (chunk.type) {
    case 'text-delta':
    case 'reasoning-delta':
      return chunk.text !== ''
    case 'tool-call-delta':
      return chunk.argumentsDelta !== '' || chunk.name !== undefined
    default:
      return false
  }
}
