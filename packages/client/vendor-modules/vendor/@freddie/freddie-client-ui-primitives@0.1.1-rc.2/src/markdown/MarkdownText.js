/**
 * Untrusted assistant-Markdown renderer over the direct mdast pipeline:
 * `parse.ts` grammars, the incremental streaming parser, and `render.tsx`.
 * While a message streams, all but the trailing two blocks freeze as cached
 * webjsx elements and only the source tail behind them re-parses per chunk,
 * so per-chunk work tracks the tail size instead of the whole reply. Frozen
 * blocks keep their source-offset keys when they cross the freeze boundary,
 * so `applyDiff` reconciles instead of remounting. Known deviation while
 * streaming: a reference-style link or footnote whose definition sits on the
 * other side of the freeze boundary renders literally until the settled
 * full parse self-heals it.
 *
 * Converted from a React `memo` function component (its own `useRef`-held
 * `StreamingRenderer` instance plus a `useMemo`'d children computation) to a
 * webjsx custom element: the refs become private fields, the memo'd
 * computation becomes a plain recompute inside #render guarded by a
 * last-props identity check (mirroring `memo`'s prop-equality skip and the
 * inner `useMemo`'s dependency list), and DOM update is an explicit
 * applyDiff(this, vdom) call.
 */

import { applyDiff, createElement as h } from 'webjsx'
import { IncrementalMarkdownParser } from './incremental.js'
import { parseGfm, parseGfmWithMath } from './parse.js'
import {
  collectReferenceTargets, createReferenceTargets, renderBlocks, renderFootnoteSection,
  wrapBlockChildren,
} from './render.js'
import css from './MarkdownText.css.js'

/** One settled full render: parse with math, resolve references, append the footnote section. */
function renderSettled(text, codeLabels, fileMentions) {
  const root = parseGfmWithMath(text)
  const targets = createReferenceTargets()
  collectReferenceTargets(root.children, targets)
  const context = {
    streaming: false,
    codeLabels,
    fileMentions,
    targets,
    footnoteOrder: [],
    footnoteCounts: new Map(),
  }
  const blocks = wrapBlockChildren(
    renderBlocks(root.children.map((node, index) => ({ node, key: index })), context),
    false,
  )
  const section = renderFootnoteSection(context)
  return section === null ? blocks : [...blocks, '\n', section]
}

/**
 * Streaming render state for one growing message: the incremental parser,
 * the frozen blocks' cached elements, and the reference/footnote state their
 * rendering consumed (footnote numbering assigned to frozen references is
 * final, so the tail continues from a copy of it each frame).
 */
class StreamingRenderer {
  parser = new IncrementalMarkdownParser(parseGfm)
  generation = -1
  frozenCount = 0
  frozenElements = []
  frozenTargets = createReferenceTargets()
  frozenFootnoteOrder = []
  frozenFootnoteCounts = new Map()
  lastText = null
  lastRendered = []

  /** @param codeLabels - Fence copy labels baked into cached elements; the owner replaces the renderer when they change. */
  constructor(codeLabels) {
    this.codeLabels = codeLabels
  }

  /**
   * Render the current accumulated text. Idempotent per text value, so the
   * caller may invoke it from a render path that re-executes freely.
   * @param text - The full accumulated markdown source.
   * @returns Frozen elements, re-rendered tail, and the footnote section.
   */
  render(text) {
    if (text === this.lastText) return this.lastRendered
    const { frozen, tail, generation } = this.parser.update(text)
    if (generation !== this.generation) {
      this.generation = generation
      this.frozenCount = 0
      this.frozenElements = []
      this.frozenTargets = createReferenceTargets()
      this.frozenFootnoteOrder = []
      this.frozenFootnoteCounts = new Map()
    }
    const newlyFrozen = frozen.slice(this.frozenCount)
    collectReferenceTargets(newlyFrozen.map(block => block.node), this.frozenTargets)
    // Targets visible this frame: everything frozen so far plus the current
    // tail parse — a newly frozen block's references resolved against the
    // same parse tree its definitions came from.
    const frameTargets = {
      definitions: new Map(this.frozenTargets.definitions),
      footnotes: new Map(this.frozenTargets.footnotes),
    }
    collectReferenceTargets(tail.map(block => block.node), frameTargets)
    if (newlyFrozen.length > 0) {
      const frozenContext = {
        streaming: true,
        codeLabels: this.codeLabels,
        fileMentions: undefined,
        targets: frameTargets,
        footnoteOrder: this.frozenFootnoteOrder,
        footnoteCounts: this.frozenFootnoteCounts,
      }
      // Separator newlines are cached alongside the elements so the
      // assembled children match the settled pipeline's block wrapping.
      const batch = [...this.frozenElements]
      for (const element of renderBlocks(newlyFrozen, frozenContext)) {
        if (batch.length > 0) batch.push('\n')
        batch.push(element)
      }
      this.frozenElements = batch
      this.frozenCount = frozen.length
    }
    const tailContext = {
      streaming: true,
      codeLabels: this.codeLabels,
      fileMentions: undefined,
      targets: frameTargets,
      footnoteOrder: [...this.frozenFootnoteOrder],
      footnoteCounts: new Map(this.frozenFootnoteCounts),
    }
    const children = [...this.frozenElements]
    for (const element of renderBlocks(tail, tailContext)) {
      if (children.length > 0) children.push('\n')
      children.push(element)
    }
    const section = renderFootnoteSection(tailContext)
    if (section !== null) children.push('\n', section)
    this.lastText = text
    this.lastRendered = children
    return this.lastRendered
  }
}

function propsEqual(a, b) {
  return a.text === b.text && (a.streaming ?? false) === (b.streaming ?? false)
    && a.codeLabels === b.codeLabels && a.fileMentions === b.fileMentions
}

/**
 * Render untrusted assistant-authored Markdown as semantic webjsx elements.
 * A GFM document with TeX math rendered through KaTeX; raw HTML, relative
 * links, and unsafe protocols are disabled, while absolute HTTP(S) images
 * render directly.
 */
export class DshMarkdownText extends HTMLElement {
  #props = { text: '' }
  #stream = null
  #streamLabels
  #lastProps = null
  #lastChildren = []

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #computeChildren() {
    const { text, streaming = false, codeLabels, fileMentions } = this.#props
    if (!streaming) {
      this.#stream = null
      return renderSettled(text, codeLabels, fileMentions)
    }
    if (this.#stream === null || this.#streamLabels !== codeLabels) {
      this.#stream = new StreamingRenderer(codeLabels)
      this.#streamLabels = codeLabels
    }
    return this.#stream.render(text)
  }

  #render() {
    // Mirrors the React version's memo (skip on identical props) plus the
    // inner useMemo (recompute children only when a dependency changed).
    const children = this.#lastProps !== null && propsEqual(this.#lastProps, this.#props)
      ? this.#lastChildren
      : this.#computeChildren()
    this.#lastProps = this.#props
    this.#lastChildren = children
    const vdom = h('div', { class: css.markdown ?? '' }, children)
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('dsh-markdown-text') === undefined) {
  customElements.define('dsh-markdown-text', DshMarkdownText)
}

/**
 * Create (if needed) or update a MarkdownText element in place.
 * @param el - an existing `dsh-markdown-text` element to update, or null to create one.
 * @param props - see {@link MarkdownTextProps}.
 * @returns the `dsh-markdown-text` element; keep it and pass it back in to update
 * (required for the streaming cache and settled-state memoization to persist
 * across renders of the same message).
 */
export function renderMarkdownText(el, props) {
  const target = el ?? document.createElement('dsh-markdown-text')
  target.setProps(props)
  return target
}

/**
 * One-shot creation helper preserving the original function-component call
 * shape.
 */
export function MarkdownText(props) {
  return renderMarkdownText(null, props)
}
