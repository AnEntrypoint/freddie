// AssistantMarkdown: renders assistant blocks in order — markdown text body,
// reasoning as the figma Think summary row (expand = indented gray text),
// other-block JSON fallback. Tool-call heads are NOT rendered here: the chat
// view groups them into tool rows through its keyed toolview slot (figma
// step-summary flow). Shared by finalized nodes and the streaming partial;
// the turn-level loading dots live in the chat view's tail, not here.
// Finalized content (text) nodes append IconActions once their turn ends
// (`time` is omitted for mid-turn narration and while the turn still runs);
// their branch action is enabled only when the node is also the completed
// turn's transcript tail. Think / tool-head-only nodes stay chrome-free.

import { createElement as h } from 'webjsx'
import { renderJsonBlock, renderMarkdownText } from '@freddie/freddie-client-ui-primitives'
import { renderReasoningRow } from './ReasoningRow.js'
import css from './AssistantMarkdown.css.js'

// h(MarkdownText, {...})/h(JsonBlock, {...}) call their bare one-shot
// factories synchronously (webjsx's function-component branch in
// createElement), creating a fresh freddie-markdown-text/freddie-json-block element
// on every call. This function re-runs on every streamed chunk while a turn
// is open (its own doc comment below), so a bare call destroyed
// MarkdownText's incremental StreamingRenderer (#stream) and settled-render
// memoization (#lastProps/#lastChildren) every single token, forcing a full
// markdown re-parse from scratch on every character instead of an
// incremental one -- and reset JsonBlock's open/closed toggle state.
// `identity` (the stable keyed chat-node object, threaded in by
// AssistantNodeView) plus the block's own index is the cache key: stable
// across re-renders of the same node, distinct per block position.
const cachedBlocks = new WeakMap()
function cachedBlockEl(identity, index, render, props) {
  let perNode = cachedBlocks.get(identity)
  if (perNode === undefined) {
    perNode = new Map()
    cachedBlocks.set(identity, perNode)
  }
  const el = render(perNode.get(index) ?? null, props)
  perNode.set(index, el)
  return el
}

/**
 * Renders one assistant node's ordered blocks (see file header). Stateless:
 * no per-instance state, so this stays a plain function component (not a
 * custom element) per the ui-primitives conversion pattern -- MarkdownText/
 * JsonBlock element identity is cached externally (see cachedBlockEl above)
 * since this function has no instance of its own to hold the cache.
 */
export function AssistantMarkdown({
  identity, blocks, streaming, interrupted, renderMessageImages, mentions, t,
}) {
  // Stable per locale revision (t identity changes on switch): a fresh object
  // per render would rebuild MarkdownText's component table every chunk.
  const codeLabels = { copyLabel: t('copy'), copiedLabel: t('copied') }
  const last = blocks.length - 1
  // Tool-call heads render as tool rows in the chat view's grouping pass, so
  // a node that is only those heads (or empty) would paint an empty root
  // between tool groups — skip the shell unless something visible remains.
  const hasVisible = streaming
    || interrupted === true
    || blocks.some(block => block.kind !== 'tool-call')
  if (!hasVisible) return null
  const rendered = []
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block === undefined) continue
    switch (block.kind) {
      case 'text':
        rendered.push(
          cachedBlockEl(identity, i, renderMarkdownText, {
            text: block.text,
            streaming,
            codeLabels,
            fileMentions: mentions,
          }),
        )
        break
      case 'reasoning':
        rendered.push(
          cachedBlockEl(identity, i, renderReasoningRow, { text: block.text, running: streaming && i === last, t }),
        )
        break
      case 'image': {
        // Consecutive image blocks share one gallery so several images tile
        // into rows instead of each opening a one-image group of its own.
        // Keyed by the group's FIRST block index: a streaming append that
        // extends the group then only grows `images` instead of remounting
        // the gallery under a shifted key.
        const start = i
        const group = [block]
        while (i + 1 < blocks.length) {
          const next = blocks[i + 1]
          if (next === undefined || next.kind !== 'image') break
          group.push(next)
          i += 1
        }
        // No Fragment in webjsx: a neutral keyed wrapper stands in for the
        // React Fragment this group used purely to attach the stable key.
        rendered.push(
          h('div', { key: start, class: css.contents ?? '' },
            renderMessageImages({
              images: group.map(({ attachment }) => ({ attachment })),
              align: 'start',
            }),
          ),
        )
        break
      }
      // Grouped into tool rows by ChatView; hasVisible above skips an empty shell.
      case 'tool-call':
        break
      default:
        rendered.push(
          cachedBlockEl(identity, i, renderJsonBlock, {
            label: t('message.unknownBlock'),
            payload: block.block,
            truncatedLabel: total => t('json.truncated', { total }),
          }),
        )
    }
  }
  return (
    h('div', { class: css.root ?? '', 'data-streaming': streaming || undefined },
      h('div', { class: css.body ?? '' },
        rendered,
        interrupted === true && h('span', { class: css.stopped ?? '' }, t('message.stopped')),
      ),
    )
  )
}
