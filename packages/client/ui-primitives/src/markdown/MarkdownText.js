
import { applyDiff, createElement as h } from '@freddie/webjsx'
import { IncrementalMarkdownParser } from './incremental.js'
import { parseGfm, parseGfmWithMath } from './parse.js'
import {
  collectReferenceTargets, createReferenceTargets, renderBlocks, renderFootnoteSection,
  wrapBlockChildren,
} from './render.js'
import css from './MarkdownText.css.js'
import { defineElement } from '../define-element.js'

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

  constructor(codeLabels) {
    this.codeLabels = codeLabels
  }

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

export class FreddieMarkdownText extends HTMLElement {
  #props = { text: '' }
  #stream = null
  #streamLabels
  #lastProps = null
  #lastChildren = []
  #painted = false

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    this.#painted = false
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
    const unchanged = this.#lastProps !== null && propsEqual(this.#lastProps, this.#props)
    if (unchanged && this.#painted) return
    const children = unchanged ? this.#lastChildren : this.#computeChildren()
    this.#lastProps = this.#props
    this.#lastChildren = children
    const vdom = h('div', { class: css.markdown ?? '' }, children)
    applyDiff(this, vdom)
    this.#painted = true
  }
}

defineElement('freddie-markdown-text', FreddieMarkdownText)


export function renderMarkdownText(el, props) {
  const target = el ?? document.createElement('freddie-markdown-text')
  target.setProps(props)
  return target
}

export function MarkdownText(props) {
  return renderMarkdownText(null, props)
}
