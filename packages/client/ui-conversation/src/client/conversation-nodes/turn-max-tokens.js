import { CHAT_SYNTHETIC_SEQ_OFFSETS, chatNode } from './common.js'

function lastStep(context) {
  const location = context.start?.location ?? context.matches[0]?.location
  if (location?.kind !== 'turn' && location?.kind !== 'step') return 0
  return location.turn.steps.at(-1)?.step ?? 0
}

function noticeAnchor(context, seq) {
  const location = context.start?.location ?? context.matches[0]?.location
  if (location?.kind !== 'turn' && location?.kind !== 'step') return seq
  const closing = location.turn.data.get('turn-tail')?.closing
  return closing === null || closing === undefined
    ? seq
    : closing.finalNode.seq + CHAT_SYNTHETIC_SEQ_OFFSETS.maxTokensNotice
}

function stateFrom(match) {
  if (match.event.type !== 'turn/end' || match.event.data.reason.kind !== 'max-tokens') return undefined
  return { turn: match.event.data.turn, seq: match.event.seq, time: match.event.time }
}

export const turnMaxTokensDefinition = {
  kind: 'turn-max-tokens',
  target: 'chat',
  match: (event) => {
    if (event.type === 'turn/end' && event.data.reason.kind === 'max-tokens') {
      return { id: String(event.data.turn), role: 'start' }
    }
    return null
  },
  start: (_context, match) => {
    const state = stateFrom(match)
    if (state === undefined) throw new Error('turn-max-tokens start requires a max-tokens turn/end')
    return state
  },
  update: context => context.state,
  buildViewNode: (context) => {
    const state = context.state
    if (state === undefined) return null
    const node = {
      kind: 'turn-max-tokens',
      seq: state.seq,
      time: state.time,
      turn: state.turn,
      step: lastStep(context),
    }
    return chatNode(context, 'turn-max-tokens', noticeAnchor(context, state.seq), node)
  },
}

export function registerTurnMaxTokensConversationNode(ctx) {
  ctx.conversationEvents.register(turnMaxTokensDefinition)
}
