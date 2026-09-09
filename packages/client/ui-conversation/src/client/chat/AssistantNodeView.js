import { createElement as h } from 'webjsx'
import { AssistantMarkdown } from './AssistantMarkdown.js'

// The mentions resolver, memoized per chat node. MarkdownText compares
// `fileMentions` by IDENTITY (its propsEqual memo guarding #computeChildren),
// so handing it a new object per render made that memo miss unconditionally
// and re-parsed the whole markdown document -- rebuilding every inline
// element on every keystroke. Measured live by instrumenting propsEqual: the
// closing block saw 4 distinct resolvers across 5 renders.
//
// `node` is the cache key because it is the only identity here that is
// genuinely stable across re-renders of the same message (ChatNodeSeat keys
// its seat on it, and AssistantMarkdown already takes it as `identity`).
// `owner` cannot be: it is a fresh literal below. `turn` cannot either: it
// rides `node.location`, which the session snapshot rebuilds. The recorded
// seq and openFile are validators, so a genuine change still yields a new
// resolver and a real re-render.
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
