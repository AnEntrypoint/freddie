import { applyDiff, createElement as h } from '@freddie/webjsx'
import { defineElement, renderJsonBlock, renderMarkdownText } from '@freddie/freddie-client-ui-primitives'
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

class FreddieAssistantMarkdown extends HTMLElement {
  #props
  #cachedBlocks = new Map()

  setProps(props) {
    this.#props = props
    this.#render()
  }

  #cachedBlockEl(index, render, props) {
    const el = render(this.#cachedBlocks.get(index) ?? null, props)
    this.#cachedBlocks.set(index, el)
    return el
  }

  #render() {
    const { blocks, streaming, interrupted, renderMessageImages, mentions, t } = this.#props
    const codeLabels = codeLabelsFor(t)
    const last = blocks.length - 1
    const rendered = []
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      if (block === undefined) continue
      switch (block.kind) {
        case 'text':
          rendered.push(
            this.#cachedBlockEl(i, renderMarkdownText, {
              text: block.text,
              streaming,
              codeLabels,
              fileMentions: mentions,
            }),
          )
          break
        case 'reasoning':
          rendered.push(
            this.#cachedBlockEl(i, renderReasoningRow, { text: block.text, running: streaming && i === last, t }),
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
            this.#cachedBlockEl(i, renderJsonBlock, {
              label: t('message.unknownBlock'),
              payload: block.block,
              truncatedLabel: total => t('json.truncated', { total }),
            }),
          )
      }
    }
    applyDiff(this,
      h('div', { class: css.body ?? '' },
        rendered,
        interrupted === true && h('span', { class: css.stopped ?? '' }, t('message.stopped')),
      ),
    )
  }
}

const tag = defineElement('freddie-assistant-markdown', FreddieAssistantMarkdown)

export function AssistantMarkdown(props) {
  const { identity, blocks, streaming, interrupted } = props
  const hasVisible = streaming
    || interrupted === true
    || blocks.some(block => block.kind !== 'tool-call')
  if (!hasVisible) return null
  return h(tag, {
    key: identity,
    class: css.root ?? '',
    'data-streaming': streaming || undefined,
    ref: el => el.setProps(props),
  })
}
