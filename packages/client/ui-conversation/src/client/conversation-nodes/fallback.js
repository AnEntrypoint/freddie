import { isAppendSurfaceEvent } from '@freddie/freddie-client-runtime/client'
import { chatNode } from './common.js'

export const unknownFallbackDefinition = {
  kind: 'unknown-surface',
  target: 'chat',
  match: event => isAppendSurfaceEvent(event)
    ? { id: String(event.seq), role: 'start' }
    : null,
  start: (_context, match) => ({
    kind: 'unknown',
    seq: match.event.seq,
    time: match.event.time,
    type: match.event.type,
    data: match.event.data,
  }),
  update: context => context.state,
  buildViewNode: context => context.state === undefined
    ? null
    : chatNode(context, 'unknown', context.state.seq, context.state),
}

export function registerUnknownConversationFallback(ctx) {
  ctx.conversationEvents.registerFallback(unknownFallbackDefinition)
}
