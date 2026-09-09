// JsonTree: read-only, keyboard-accessible JSON inspector tree with
// hover-triggered per-row copy controls (value/JSON/path via a right-click
// or long-press menu). Converted from a React hooks component to a webjsx
// custom element: every useState becomes an instance field, useEffect
// mount/cleanup becomes connectedCallback/disconnectedCallback, and
// re-render is an explicit applyDiff(this, vdom) call (Toast.tsx's
// pattern). The copy control's Menu is now the class-based DshMenu; it is
// created once and updated via setProps rather than re-mounted every render.

import { applyDiff, createElement as h, Fragment } from 'webjsx'
import clsx from 'clsx'
import { IconCheckOutline16, IconCopyOutline16 } from './icons/index.js'
import { renderMenu } from './Menu.js'
import css from './JsonTree.css.js'

const OBJECT_PREVIEW_LIMIT = 4
const ARRAY_PREVIEW_LIMIT = 5
const PREVIEW_DEPTH_LIMIT = 2

const DEFAULT_LABELS = {
  copyValue: 'Copy value',
  copyJson: 'Copy JSON',
  copyPath: 'Copy property path',
  copyPrettyJson: 'Copy pretty JSON',
  copyCompactJson: 'Copy compact JSON',
  copied: 'Copied',
  copyFailed: 'Copy failed',
  collapseNode: 'Collapse JSON node',
  expandNode: 'Expand JSON node',
  copyButtonTitle: action => `${action}; right-click for copy options`,
}

function valueCopyMenuItems(labels) {
  return [
    { id: 'value', label: labels.copyValue },
    { id: 'json', label: labels.copyJson },
    { id: 'path', label: labels.copyPath },
  ]
}

function objectCopyMenuItems(labels) {
  return [
    { id: 'prettyJson', label: labels.copyPrettyJson },
    { id: 'json', label: labels.copyCompactJson },
    { id: 'path', label: labels.copyPath },
  ]
}

function isExpandableValue(value) {
  return typeof value === 'object' && value !== null && !(value instanceof Date)
}

function entriesOf(value) {
  if (Array.isArray(value)) {
    return value.map((item, index) => [String(index), item])
  }
  return Object.keys(value).map(key => [
    key,
    value[key],
  ])
}

function bracketOf(value) {
  return Array.isArray(value) ? ['[', ']'] : ['{', '}']
}

function previewPrimitive(value) {
  if (value === null) return h('span', { class: css.keywordValue ?? '' }, 'null')
  if (typeof value === 'string') {
    return h('span', { class: css.stringValue ?? '' }, JSON.stringify(value))
  }
  if (typeof value === 'number') {
    return h('span', { class: css.numberValue ?? '' }, String(value))
  }
  if (typeof value === 'boolean') {
    return h('span', { class: css.keywordValue ?? '' }, String(value))
  }
  if (typeof value === 'bigint') {
    return h('span', { class: css.otherValue ?? '' }, value.toString())
  }
  if (typeof value === 'undefined') {
    return h('span', { class: css.otherValue ?? '' }, 'undefined')
  }
  if (typeof value === 'symbol') {
    return h('span', { class: css.otherValue ?? '' }, value.description ?? 'Symbol')
  }
  if (typeof value === 'function') {
    return h('span', { class: css.otherValue ?? '' }, value.name || 'Function')
  }
  return null
}

function previewValue(value, depth) {
  if (!isExpandableValue(value)) return previewPrimitive(value)

  const array = Array.isArray(value)
  const entries = entriesOf(value)
  const limit = array ? ARRAY_PREVIEW_LIMIT : OBJECT_PREVIEW_LIMIT
  const visible = entries.slice(0, limit)
  const [open, close] = bracketOf(value)

  return h(
    Fragment,
    null,
    h('span', { class: css.punctuation ?? '' }, open),
    depth >= PREVIEW_DEPTH_LIMIT
      ? h('span', { class: css.previewEllipsis ?? '' }, '…')
      : visible.map(([key, item], index) => (
        h(
          'span',
          { key: key },
          index > 0 && h('span', { class: css.punctuation ?? '' }, ', '),
          !array && (
            h(
              Fragment,
              null,
              h('span', { class: css.previewProperty ?? '' }, key),
              h('span', { class: css.punctuation ?? '' }, ': '),
            )
          ),
          previewValue(item, depth + 1),
        )
      )),
    depth < PREVIEW_DEPTH_LIMIT && entries.length > limit && (
      h('span', { class: css.previewEllipsis ?? '' }, ', …')
    ),
    h('span', { class: css.punctuation ?? '' }, close),
  )
}

function primitiveValue(value) {
  if (value === null) return h('span', { class: css.keywordValue ?? '' }, 'null')
  if (typeof value === 'string') {
    return h('span', { class: css.stringValue ?? '' }, JSON.stringify(value))
  }
  if (typeof value === 'boolean') {
    return h('span', { class: css.keywordValue ?? '' }, String(value))
  }
  if (typeof value === 'number') {
    return h('span', { class: css.numberValue ?? '' }, String(value))
  }
  if (typeof value === 'bigint') {
    return h('span', { class: css.numberValue ?? '' }, `${value.toString()}n`)
  }
  if (value instanceof Date) {
    return h('span', { class: css.otherValue ?? '' }, value.toISOString())
  }
  if (typeof value === 'function') {
    return h('span', { class: css.otherValue ?? '' }, 'function() ', '{ }')
  }
  if (typeof value === 'undefined') {
    return h('span', { class: css.otherValue ?? '' }, 'undefined')
  }
  return h('span', { class: css.otherValue ?? '' }, value.toString())
}

function fieldText(field) {
  return field === '' ? '""' : field
}

function pathId(path) {
  return path.map(part => (
    typeof part === 'number' ? `n${String(part)}` : `s${String(part.length)}:${part}`
  )).join('/')
}

function claimFocus(button) {
  button.focus()
}

function moveFocus(button, direction) {
  const tree = button.closest('[role="tree"]')
  if (tree === null) return
  const expanders = Array.from(tree.querySelectorAll('[data-json-expander]'))
  const current = expanders.indexOf(button)
  if (current < 0 || expanders.length === 0) return
  const next = (current + direction + expanders.length) % expanders.length
  const nextExpander = expanders[next]
  if (nextExpander !== undefined) claimFocus(nextExpander)
}

function renderNodeField(field, expandable, onToggle) {
  if (field === undefined) return null
  return h(
    'span',
    {
      class: clsx(css.label, expandable && css.clickableLabel),
      onclick: expandable ? onToggle : null,
    },
    fieldText(field), ':',
  )
}

function renderJsonTreeNode(args) {
  const { field, initialExpanded, labels, lastElement, onClaimTabStop, onRowHover, path, tabStopId, value, expandState, rerender } = args
  const nodeId = pathId(path)
  const container = isExpandableValue(value)
  const entries = container ? entriesOf(value) : []
  const expandable = entries.length > 0
  const expanded = expandState.get(nodeId, initialExpanded)

  const toggle = () => {
    expandState.set(nodeId, !expanded)
    rerender()
    // Refocus the expander after the diff lands.
    queueMicrotask(() => {
      const el = document.querySelector(`[data-json-expander][data-node-id="${nodeId}"]`)
      if (el !== null) claimFocus(el)
    })
  }

  const onExpanderKeyDown = (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      expandState.set(nodeId, event.key === 'ArrowRight')
      rerender()
      return
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(event.currentTarget, event.key === 'ArrowUp' ? -1 : 1)
    }
  }

  const row = (children, ariaExpanded) => (
    h(
      'div',
      {
        class: css.row ?? '',
        role: 'treeitem',
        'aria-expanded': ariaExpanded,
        onmouseover: (event) => {
          event.stopPropagation()
          onRowHover(event.currentTarget, { path, value })
        },
      },
      children,
    )
  )

  if (!container) {
    return row((
      h(
        Fragment,
        null,
        renderNodeField(field, false, toggle),
        primitiveValue(value),
        !lastElement && h('span', { class: css.punctuation ?? '' }, ','),
      )
    ))
  }

  const [open, close] = bracketOf(value)
  if (!expandable) {
    return row((
      h(
        Fragment,
        null,
        renderNodeField(field, false, toggle),
        h('span', { class: css.punctuation ?? '' }, open),
        h('span', { class: css.punctuation ?? '' }, close),
        !lastElement && h('span', { class: css.punctuation ?? '' }, ','),
      )
    ))
  }

  return row((
    h(
      Fragment,
      null,
      h('span', {
        class: clsx(css.expander, expanded ? css.collapseIcon : css.expandIcon),
        'data-json-expander': '',
        'data-node-id': nodeId,
        role: 'button',
        'aria-label': expanded ? labels.collapseNode : labels.expandNode,
        'aria-expanded': expanded,
        tabIndex: tabStopId === nodeId ? 0 : -1,
        onfocus: () => { onClaimTabStop(nodeId) },
        onclick: toggle,
        onkeydown: onExpanderKeyDown,
      }),
      renderNodeField(field, true, toggle),
      h('span', { class: css.preview ?? '' }, previewValue(value, 0)),
      !lastElement && h('span', { class: css.punctuation ?? '' }, ','),
      expanded && (
        h(
          'ul',
          { role: 'group', class: css.children ?? '' },
          entries.map(([key, item], index) => (
            renderJsonTreeNode({
              field: key,
              value: item,
              path: [...path, Array.isArray(value) ? index : key],
              labels,
              lastElement: index === entries.length - 1,
              initialExpanded: false,
              tabStopId,
              onClaimTabStop,
              onRowHover,
              expandState,
              rerender,
            })
          )),
        )
      ),
    )
  ), expanded)
}

function formattedPath(path) {
  return path.reduce((result, part) => {
    if (typeof part === 'number') return `${result}[${String(part)}]`
    return /^[A-Za-z_$][\w$]*$/.test(part)
      ? `${result}.${part}`
      : `${result}[${JSON.stringify(part)}]`
  }, '$')
}

function copyText(target, mode) {
  if (mode === 'path') return formattedPath(target.path)
  if (mode === 'prettyJson') return JSON.stringify(target.value, null, 2)
  if (mode === 'json') return JSON.stringify(target.value)
  if (typeof target.value === 'string') return target.value
  if (typeof target.value === 'undefined') return 'undefined'
  if (typeof target.value === 'bigint') return target.value.toString()
  if (typeof target.value === 'symbol') return target.value.description ?? 'Symbol'
  if (typeof target.value === 'function') return target.value.name || 'Function'
  return JSON.stringify(target.value)
}

const DEFAULT_PROPS = { data: {} }

/** Read-only, keyboard-accessible JSON inspector tree custom element. */
export class DshJsonTree extends HTMLElement {
  #props = DEFAULT_PROPS
  #activeRow
  #copyMenuOpen = false
  #resetTimer
  #copyTarget
  #copyState = 'idle'
  #tabStopId = null
  #expandMap = new Map()
  #scrollHandler = null
  #menuEl = null
  #lastDataRef = undefined

  setProps(props) {
    const dataChanged = props.data !== this.#lastDataRef
    this.#props = props
    if (dataChanged) {
      this.#lastDataRef = props.data
      this.#activeRow?.removeAttribute('data-json-copy-active')
      this.#activeRow = undefined
      this.#copyMenuOpen = false
      this.#copyTarget = undefined
      this.#copyState = 'idle'
      this.#expandMap.clear()
      this.#tabStopId = this.#computeInitialTabStopId()
    }
    this.#render()
  }

  connectedCallback() {
    this.#tabStopId = this.#computeInitialTabStopId()
    const reposition = () => {
      const row = this.#activeRow
      if (row !== undefined) this.#repositionCopyButton(row)
    }
    this.#scrollHandler = reposition
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    this.#render()
  }

  disconnectedCallback() {
    if (this.#resetTimer !== undefined) clearTimeout(this.#resetTimer)
    this.#activeRow?.removeAttribute('data-json-copy-active')
    if (this.#scrollHandler !== null) {
      window.removeEventListener('scroll', this.#scrollHandler, true)
      window.removeEventListener('resize', this.#scrollHandler)
      this.#scrollHandler = null
    }
    this.#menuEl?.remove()
    this.#menuEl = null
  }

  #computeInitialTabStopId() {
    const { data, expandTopLevel = true } = this.#props
    const rootEntries = entriesOf(data)
    const firstExpandableIndex = rootEntries.findIndex(([, value]) => (
      isExpandableValue(value) && entriesOf(value).length > 0
    ))
    const firstExpandableEntry = rootEntries[firstExpandableIndex]
    return expandTopLevel
      ? firstExpandableEntry === undefined
        ? null
        : pathId([Array.isArray(data) ? firstExpandableIndex : firstExpandableEntry[0]])
      : isExpandableValue(data) && rootEntries.length > 0 ? pathId([]) : null
  }

  #setActiveRow(row) {
    this.#activeRow?.removeAttribute('data-json-copy-active')
    this.#activeRow = row
    row?.setAttribute('data-json-copy-active', '')
  }

  #clearCopyTarget() {
    this.#setActiveRow(undefined)
    this.#copyTarget = undefined
    this.#copyState = 'idle'
    this.#copyMenuOpen = false
    this.#render()
  }

  #copyPosition(row) {
    const root = this.querySelector('[data-json-tree-root]')
    if (root === null) throw new Error('JsonTree root is not mounted')
    const rootRect = root.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    return {
      left: rootRect.left + root.clientWidth - 26,
      side: rowRect.top - rootRect.top > root.clientHeight / 2 ? 'top' : 'bottom',
      top: rowRect.top,
    }
  }

  #positionCopyButton(row, target) {
    const position = this.#copyPosition(row)
    this.#copyTarget = { ...target, ...position }
  }

  #repositionCopyButton(row) {
    if (this.#copyTarget === undefined) return
    const position = this.#copyPosition(row)
    this.#copyTarget = { ...this.#copyTarget, ...position }
    this.#render()
  }

  #handleRowHover(row, target) {
    const { copyable = true } = this.#props
    if (!copyable || this.#copyMenuOpen) return
    if (this.#activeRow === row) return
    this.#setActiveRow(row)
    this.#copyState = 'idle'
    this.#copyMenuOpen = false
    this.#positionCopyButton(row, target)
    this.#render()
  }

  async #copy(mode) {
    if (this.#copyTarget === undefined) return
    try {
      await navigator.clipboard.writeText(copyText(this.#copyTarget, mode))
      this.#copyState = 'copied'
    } catch {
      this.#copyState = 'failed'
    }
    if (this.#resetTimer !== undefined) clearTimeout(this.#resetTimer)
    this.#resetTimer = setTimeout(() => {
      this.#copyState = 'idle'
      this.#render()
    }, 1_500)
    this.#render()
  }

  #render() {
    const { data, label = 'JSON', className, copyable = true, expandTopLevel = true, labels } = this.#props
    const copyLabels = labels === undefined ? DEFAULT_LABELS : { ...DEFAULT_LABELS, ...labels }
    const rootEntries = entriesOf(data)

    const expandState = {
      get: (nodeId, initial) => this.#expandMap.get(nodeId) ?? initial,
      set: (nodeId, value) => { this.#expandMap.set(nodeId, value) },
    }
    const rerender = () => { this.#render() }

    const [rootOpen, rootClose] = bracketOf(data)
    const copyTargetIsObject = typeof this.#copyTarget?.value === 'object' && this.#copyTarget.value !== null
    const defaultCopyMode = copyTargetIsObject ? 'prettyJson' : 'value'
    const copyTitle = this.#copyState === 'copied'
      ? copyLabels.copied
      : this.#copyState === 'failed'
        ? copyLabels.copyFailed
        : copyTargetIsObject ? copyLabels.copyPrettyJson : copyLabels.copyValue

    const onRowHover = (row, target) => { this.#handleRowHover(row, target) }
    const onClaimTabStop = (id) => { this.#tabStopId = id; this.#render() }

    const vdom = h(
      'div',
      {
        'data-json-tree-root': '',
        class: clsx(css.root, className),
        onmouseover: (event) => {
          if (!copyable || this.#copyMenuOpen) return
          if (!(event.target instanceof Element)) return
          if (event.target.closest('[data-json-copy-button]') === null) this.#clearCopyTarget()
        },
        onmouseleave: () => {
          if (!this.#copyMenuOpen) this.#clearCopyTarget()
        },
        onscroll: () => {
          const row = this.#activeRow
          if (row !== undefined) this.#repositionCopyButton(row)
        },
      },
      expandTopLevel
        ? (
          h(
            'div',
            { class: css.expandedTopLevel ?? '' },
            h(
              'div',
              {
                class: clsx(css.row, css.topLevelBracket),
                'data-json-root-row': '',
                onmouseover: (event) => {
                  event.stopPropagation()
                  onRowHover(event.currentTarget, { path: [], value: data })
                },
              },
              h('span', { class: css.punctuation ?? '' }, rootOpen),
            ),
            h(
              'div',
              {
                'aria-label': label,
                class: clsx(css.container, css.expandedTopLevelContainer),
                role: 'tree',
              },
              rootEntries.map(([key, value], index) => (
                renderJsonTreeNode({
                  field: key,
                  value,
                  path: [Array.isArray(data) ? index : key],
                  labels: copyLabels,
                  lastElement: index === rootEntries.length - 1,
                  initialExpanded: false,
                  tabStopId: this.#tabStopId,
                  onClaimTabStop,
                  onRowHover,
                  expandState,
                  rerender,
                })
              )),
            ),
            h(
              'div',
              { class: clsx(css.row, css.topLevelBracket) },
              h('span', { class: css.punctuation ?? '' }, rootClose),
            ),
          )
        )
        : (
          h(
            'div',
            { 'aria-label': label, class: css.container ?? '', role: 'tree' },
            renderJsonTreeNode({
              value: data,
              path: [],
              labels: copyLabels,
              lastElement: true,
              initialExpanded: true,
              tabStopId: this.#tabStopId,
              onClaimTabStop,
              onRowHover,
              expandState,
              rerender,
            }),
          )
        ),
      this.#copyTarget !== undefined && (
        h(
          'span',
          {
            'data-json-copy-anchor': '',
            class: css.copyAnchor ?? '',
            style: `left: ${this.#copyTarget.left}px; top: ${this.#copyTarget.top}px`,
          },
          h(
            'button',
            {
              'data-json-copy-button-el': '',
              type: 'button',
              class: css.copyButton ?? '',
              'data-json-copy-button': '',
              'data-state': this.#copyState,
              'aria-label': copyTitle,
              title: copyLabels.copyButtonTitle(copyTitle),
              onclick: () => void this.#copy(defaultCopyMode),
              oncontextmenu: (event) => {
                event.preventDefault()
                event.stopPropagation()
                this.#copyMenuOpen = true
                this.#render()
              },
            },
            this.#copyState === 'copied'
              ? h(IconCheckOutline16, { size: 12 })
              : h(IconCopyOutline16, { size: 12 }),
          ),
        )
      ),
    )
    applyDiff(this, vdom)

    // The copy menu is a separately-managed portal element (Menu's own
    // pattern), wired to the just-rendered copy button.
    if (this.#copyTarget !== undefined) {
      const button = this.querySelector('[data-json-copy-button-el]')
      this.#menuEl = renderMenu(this.#menuEl, {
        open: this.#copyMenuOpen,
        compact: true,
        portal: true,
        align: 'end',
        side: this.#copyTarget.side,
        anchor: '',
        items: copyTargetIsObject ? objectCopyMenuItems(copyLabels) : valueCopyMenuItems(copyLabels),
        onSelect: (id) => {
          void this.#copy(id)
          this.#copyMenuOpen = false
          this.#render()
        },
        onClose: () => { this.#clearCopyTarget() },
        getAnchorRect: () => button?.getBoundingClientRect() ?? null,
      })
    } else if (this.#menuEl !== null) {
      this.#menuEl.remove()
      this.#menuEl = null
    }
  }
}

if (typeof customElements !== 'undefined' && customElements.get('dsh-json-tree') === undefined) {
  customElements.define('dsh-json-tree', DshJsonTree)
}

/**
 * Create (if needed) or update a JsonTree element in place.
 * @param el - an existing `dsh-json-tree` element to update, or null to create one.
 * @param props - see {@link JsonTreeProps}.
 * @returns the `dsh-json-tree` element; keep it and pass it back in to update.
 */
export function renderJsonTree(el, props) {
  const target = el ?? document.createElement('dsh-json-tree')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function JsonTree(props) {
  return renderJsonTree(null, props)
}
