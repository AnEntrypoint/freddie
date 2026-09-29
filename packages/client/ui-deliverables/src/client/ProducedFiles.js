import { applyDiff, createElement as h } from '@freddie/webjsx'
import { basename } from './turn-deliverables.js'
import css from './ProducedFiles.css.js'
import { defineElement } from '@freddie/freddie-client-ui-primitives'

const SHOWN_LIMIT = 6

export function fitProducedFiles(
  available,
  gap,
  chipWidths,
  moreWidthsByShown,
) {
  if (available <= 0) return chipWidths.length
  const prefix = [0]
  let prefixWidth = 0
  for (const width of chipWidths) {
    prefixWidth += width
    prefix.push(prefixWidth)
  }
  let largestFit = 0
  for (const [shown, width] of prefix.entries()) {
    const more = moreWidthsByShown[shown]
    const items = shown + (more === undefined ? 0 : 1)
    const needed = width + (more ?? 0) + Math.max(0, items - 1) * gap
    if (needed <= available) largestFit = shown
  }
  return largestFit
}

function moreLabel(t, count) {
  return count === 1 ? t('produced.moreOne') : t('produced.more', { count: String(count) })
}

function pathsKey(paths) {
  return paths.join('')
}

export class FreddieProducedFiles extends HTMLElement {
  #props = null
  #shownCount = SHOWN_LIMIT
  #observer = null
  #rowEl = null
  #moreProbeEl = null
  #chipProbeEls = []
  #measuredKey = null

  setProps(props) {
    this.#props = props
    const key = pathsKey(props.matched)
    const pathsChanged = key !== this.#measuredKey
    if (pathsChanged) this.#shownCount = Math.min(props.matched.length, SHOWN_LIMIT)
    this.#render()
    if (pathsChanged) {
      this.#measuredKey = key
      this.#remeasure()
    }
  }

  connectedCallback() {
    this.#render()
    this.#measuredKey = this.#props === null ? null : pathsKey(this.#props.matched)
    this.#remeasure()
  }

  disconnectedCallback() {
    this.#observer?.disconnect()
    this.#observer = null
    this.#measuredKey = null
  }

  #measure() {
    const props = this.#props
    const row = this.#rowEl
    const remainderProbe = this.#moreProbeEl
    if (props === null || row === null || remainderProbe === null) return
    const { matched: paths, t } = props
    const limit = Math.min(paths.length, SHOWN_LIMIT)
    const styles = getComputedStyle(row)
    const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0
    const activeChipProbes = this.#chipProbeEls.slice(0, limit)
    const chips = activeChipProbes.map(probe => probe.getBoundingClientRect().width)
    const more = Array.from({ length: limit + 1 }, (_, candidate) => {
      if (paths.length === candidate) return undefined
      remainderProbe.textContent = moreLabel(t, paths.length - candidate)
      return remainderProbe.getBoundingClientRect().width
    })
    const next = fitProducedFiles(row.clientWidth, gap, chips, more)
    if (next !== this.#shownCount) {
      this.#shownCount = next
      this.#render()
    }
  }

  #remeasure() {
    this.#observer?.disconnect()
    this.#observer = null
    queueMicrotask(() => {
      const row = this.#rowEl
      if (row === null) return
      this.#measure()
      if (typeof ResizeObserver === 'undefined') return
      const observer = new ResizeObserver(() => { this.#measure() })
      observer.observe(row)
      for (const probe of this.#chipProbeEls) {
        if (probe !== null) observer.observe(probe)
      }
      this.#observer = observer
    })
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { matched: paths, openFile, isLoopback, useHostDescription, t } = props
    const hostCanOpenPath = useHostDescription(description => description?.canOpenPath === true)
    const canOpenPath = isLoopback && hostCanOpenPath
    const limit = Math.min(paths.length, SHOWN_LIMIT)
    const visibleCount = Math.min(this.#shownCount, limit)
    const shown = paths.slice(0, visibleCount)
    const hidden = paths.length - shown.length

    this.#chipProbeEls = []
    const vdom = h('div', {class: css.root ?? ''},
      h('span', {class: css.label ?? ''}, t('produced.label')),
      h('div', {
        ref: (node) => { this.#rowEl = node },
        class: css.row ?? '',
        'data-produced-files-row': '',
      },
        shown.map(path => (
          h('button', {
            key: path,
            type: 'button',
            class: css.file ?? '',
            title: path,
            'aria-label': t('produced.open', { name: path }),
            onclick: () => { openFile(path) },
          },
            basename(path),
          )
        )),
        hidden > 0 && h('span', {class: css.more ?? ''}, moreLabel(t, hidden)),
      ),
      hidden > 0 && canOpenPath && (
        h('button', {type: 'button', class: css.showFolder ?? '', onclick: () => { openFile('.') }},
          t('produced.showInFolder'),
        )
      ),
      h('div', {class: css.measure ?? '', 'aria-hidden': 'true'},
        paths.slice(0, limit).map((path, index) => (
          h('button', {
            key: path,
            ref: (node) => { this.#chipProbeEls[index] = node },
            type: 'button',
            tabIndex: -1,
            class: `${css.file ?? ''} ${css.probe ?? ''}`,
          },
            basename(path),
          )
        )),
        h('span', {
          ref: (node) => { this.#moreProbeEl = node },
          class: `${css.more ?? ''} ${css.probe ?? ''}`,
        }),
      ),
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-produced-files', FreddieProducedFiles)
