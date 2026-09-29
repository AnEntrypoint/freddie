import { createElement as h } from '@freddie/webjsx'
import { renderJsonBlock, renderMarkdownText } from '@freddie/freddie-client-ui-primitives'
import { renderReasoningRow } from './ReasoningRow.js'
import css from './AssistantMarkdown.css.js'

const codeLabelsByT = new WeakMap()
function codeLabelsFor(t) {
  let labels = codeLabelsByT.get(t)
  if (labels === undefined) {
    labels = { copyLabel: t('copy'), copiedLabel: t('copied') }
    codeLabelsByT.set(t, labels)
  }
  return labels
}

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

export function AssistantMarkdown({
  identity, blocks, streaming, interrupted, renderMessageImages, mentions, t,
}) {
  const codeLabels = codeLabelsFor(t)
  const last = blocks.length - 1
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
        const start = i
        const group = [block]
        while (i + 1 < blocks.length) {
          const next = blocks[i + 1]
          if (next === undefined || next.kind !== 'image') break
          group.push(next)
          i += 1
        }
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
