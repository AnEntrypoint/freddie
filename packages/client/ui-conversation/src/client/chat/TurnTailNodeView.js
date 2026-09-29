import { createElement as h } from '@freddie/webjsx'
import { renderMessageIconActions } from './MessageIconActions.js'
import { assistantText } from './turn-assistant.js'
import css from './TurnTailNodeView.css.js'

const cachedIconActions = new WeakMap()
function cachedMessageIconActions(identity, props) {
  const el = renderMessageIconActions(cachedIconActions.get(identity) ?? null, props)
  cachedIconActions.set(identity, el)
  return el
}

/** Turn-local actions and feature tail over the Location index, independent of Assistant placement. */
export function TurnTailNodeView({
  node, openFile, forkAt, renderSlot, renderSlotChain, t, useSession,
}) {
  const data = node.data
  const hasLaterChatNode = useSession(snapshot =>
    snapshot.chat.locations.getTurn(data.turn).at(-1) !== node.key)
  const turn = node.location.kind === 'turn' || node.location.kind === 'step'
    ? node.location.turn
    : undefined
  if (turn === undefined) return null
  const closing = data.closing
  const owner = { turn, seq: closing?.finalNode.seq ?? data.seq, openFile }
  const tail = renderSlotChain('conversation.chat.turnTail', owner)
  if (closing === null) return tail === null ? null : h('div', { class: css.root ?? '' }, tail)
  const runMs = turn.start === undefined || turn.end === undefined
    ? undefined
    : Math.max(0, turn.end.time - turn.start.time)
  const messageId = closing.finalNode.messageId
  const assistantActions = messageId === undefined
    ? null
    : renderSlot('conversation.chat.assistant-actions', { messageId })
  return (
    h('div', { class: css.root ?? '', 'data-turn-tail': data.turn, 'data-time-hover-root': true },
      tail,
      cachedMessageIconActions(node, {
        text: assistantText(closing.blocks),
        time: closing.time,
        runMs,
        ttftMs: data.ttftMs,
        tokensPerSecond: data.tokensPerSecond,
        clock: 'end',
        onBranch: () => { forkAt(closing.finalNode.seq) },
        branchUnavailable: data.branchUnavailable || hasLaterChatNode,
        className: css.actions,
        extraActions: assistantActions,
        t,
      }),
    )
  )
}
