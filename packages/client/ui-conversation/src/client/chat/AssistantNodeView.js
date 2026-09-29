import { createElement as h } from '@freddie/webjsx'
import { AssistantMarkdown } from './AssistantMarkdown.js'

const mentionsByNode = new WeakMap()
function cachedMentions(node, fileMentions, owner) {
  const cached = mentionsByNode.get(node)
  if (cached !== undefined && cached.seq === owner.seq && cached.openFile === owner.openFile) {
    return cached.value
  }
  const value = fileMentions(owner)
  mentionsByNode.set(node, { seq: owner.seq, openFile: owner.openFile, value })
  return value
}

/** Streaming, settled, and interrupted Assistant states share one keyed renderer instance. */
export function AssistantNodeView({
  node, useTurnData, openFile, renderMessageImages, fileMentions, t,
}) {
  const data = node.data
  const turn = node.location.kind === 'turn' || node.location.kind === 'step'
    ? node.location.turn
    : undefined
  const tail = useTurnData('turn-tail')
  const owner = turn?.status !== 'closed' || data.finalNode === undefined
    ? undefined
    : tail?.closing?.finalNode.seq !== data.finalNode.seq
      ? undefined
      : { turn, seq: data.finalNode.seq, openFile }
  const mentions = owner === undefined ? undefined : cachedMentions(node, fileMentions, owner)
  return (
    h(AssistantMarkdown, {
      identity: node,
      blocks: data.blocks,
      streaming: data.status === 'running',
      interrupted: data.status === 'interrupted',
      renderMessageImages,
      mentions,
      t,
    })
  )
}
