/** Card-aware output body for the selected Tool call in details. */
import { createElement as h, Fragment } from 'webjsx'
import {
  renderDiffBlock, renderMarkdownText, renderReadBlock, renderSearchBlock, renderTerminalBlock, WebBlock,
} from '@freddie/freddie-client-ui-primitives'
import { diffCardModel } from './models/diff-card-model.js'
import { readCardModel } from './models/read-card-model.js'
import { searchCardModel } from './models/search-card-model.js'
import { terminalBlockLabels, terminalCardModel } from './models/terminal-card-model.js'
import { resultText } from './models/tool-call-model.js'
import { webCardModel } from './models/web-card-model.js'
import css from './ToolDetails.css.js'

// TerminalBlock/ReadBlock/DiffBlock/SearchBlock's own one-shot factories
// (and WebBlock's inner MarkdownText, see WebBlock.js) recreate their DOM
// element (dropping copy-feedback/expanded-state/settled-render memoization)
// on every call; ToolDetails is a plain function re-invoked whenever the
// details pane's selection or data changes. `block` (the selected tool
// call's own data object, stable across re-renders of the same selection)
// is the cache key.
const cachedBlocks = new WeakMap()
function cachedBlock(identity, key, render, props) {
  let perIdentity = cachedBlocks.get(identity)
  if (perIdentity === undefined) {
    perIdentity = new Map()
    cachedBlocks.set(identity, perIdentity)
  }
  const el = render(perIdentity.get(key) ?? null, props)
  perIdentity.set(key, el)
  return el
}

/**
 * Render the selected Tool call's structured output when its presentation
 * intent is known, otherwise preserve the flattened result text.
 * @param props - selected call slice, workspace root, host home, and locale seat.
 * @returns the details output body.
 */
export function ToolDetails({
  block, cwd, useHostDescription, t,
}) {
  const home = useHostDescription(description => description?.home)
  const terminal = terminalCardModel(block, cwd)
  if (terminal !== null) {
    return [
      terminal.description !== undefined ? (
        h('div', {class: css.description ?? ''}, terminal.description)
      ) : null,
      cachedBlock(block, 'terminal', renderTerminalBlock, {...terminal.card, labels: terminalBlockLabels(t), className: css.cardBody}),
    ]
  }
  const read = readCardModel(block, cwd, home)
  if (read !== null) return cachedBlock(block, 'read', renderReadBlock, {...read, className: css.read})
  const diff = diffCardModel(block)
  if (diff !== null) return cachedBlock(block, 'diff', renderDiffBlock, {...diff.card, className: css.cardBody})
  const search = searchCardModel(block)
  if (search !== null) {
    return [
      cachedBlock(block, 'search', renderSearchBlock, {...search.card, className: css.cardBody}),
      search.recovery !== undefined ? h('div', {class: css.recovery ?? ''}, search.recovery) : null,
    ]
  }
  const web = webCardModel(block)
  if (web !== null) {
    const body = 'kind' in block ? resultText(block) : ''
    return [
      h(WebBlock, {
        ...web,
        className: css.web,
        markdownText: props => cachedBlock(block, 'web-answer', renderMarkdownText, props),
      }),
      body !== '' ? h('pre', {class: css.code ?? ''}, body) : null,
    ]
  }
  if (!('kind' in block)) return h('div', {class: css.empty ?? ''}, t('details.running'))
  return (
    h('pre', {class: css.code ?? '', 'data-error': block.isError || undefined},
      resultText(block)
    )
  )
}
