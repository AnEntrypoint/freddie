import { createElement as h } from 'webjsx'
import { AssistantMarkdown } from './AssistantMarkdown.js'

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
  const mentions = owner === undefined ? undefined : fileMentions(owner)
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
