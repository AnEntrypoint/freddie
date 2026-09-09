// ProducedFiles: the produced-file row a finished turn ends with. The paths
// come pre-matched by the turn-tail chain from the mutation tools'
// follow-along locations, never from the closing prose. Clicking one goes
// through the same openFile the tool rows use — the Host's own opener, on the
// Host machine.
//
// Converted from a React hooks component (useState/useRef/useLayoutEffect) to
// a webjsx custom element: state becomes private fields, the layout
// measurement effect becomes connectedCallback + a ResizeObserver kept as an
// instance field, and re-render is an explicit #render() -> applyDiff call.

import { applyDiff, createElement as h } from 'webjsx'
import { basename } from './turn-deliverables.js'
import css from './ProducedFiles.css.js'

/** At most six chips compete for the one-line summary; every other path stays counted. */
const SHOWN_LIMIT = 6

/**
 * Select the largest prefix whose measured chips and exact remainder fit.
 * @param available - usable width of the one-line file lane.
 * @param gap - computed flex gap between adjacent visible items.
 * @param chipWidths - measured widths for the candidate file chips.
 * @param moreWidthsByShown - exact localized remainder width for each shown count.
 * @returns Number of leading chips to render.
 */
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

/**
 * Identity of a path list for the measurement cache (see `#measuredKey`).
 * Joined on a separator only so two lists differing by an element boundary
 * compare unequal; the key is never parsed back apart.
 * @param paths - the matched produced-file paths.
 * @returns the comparable key.
 */
function pathsKey(paths) {
  return paths.join('')
}

/**
 * Produced-files turn-tail row custom element: renders openable chips for a
 * turn's produced paths, measuring how many fit one line via a ResizeObserver
 * bound to hidden probe chips.
 */
export class FreddieProducedFiles extends HTMLElement {
  #props = null
  #shownCount = SHOWN_LIMIT
  #observer = null
  #rowEl = null
  #moreProbeEl = null
  #chipProbeEls = []
  // The path list the mounted probes were last measured against. #measure()
  // costs a forced synchronous reflow per candidate remainder label (it writes
  // the probe's textContent, then reads its width back on the same pass, up to
  // SHOWN_LIMIT + 1 times), and #remeasure() additionally rebuilds the
  // ResizeObserver. Nothing else in `props` moves a chip, so re-running either
  // for a re-render that did not change the paths is pure layout thrash --
  // and this element re-renders on every store fanout, including the one every
  // keystroke triggers. Compared by content, not array identity: the caller
  // rebuilds the array each render even when the paths are unchanged.
  #measuredKey = null

  /** Set/replace props and re-render; call after creating or updating the element. */
  setProps(props) {
    this.#props = props
    const key = pathsKey(props.matched)
    const pathsChanged = key !== this.#measuredKey
    if (pathsChanged) this.#shownCount = Math.min(props.matched.length, SHOWN_LIMIT)
    this.#render()
    // An unchanged path list keeps the fit already measured for it; the
    // ResizeObserver bound below still catches any genuine external resize.
    if (pathsChanged) {
      this.#measuredKey = key
      this.#remeasure()
    }
  }

  connectedCallback() {
    this.#render()
    // A reconnect remounts fresh probes, so the previous measurement's probe
    // elements are gone: measure again and re-key against the current paths.
    this.#measuredKey = this.#props === null ? null : pathsKey(this.#props.matched)
    this.#remeasure()
  }

  disconnectedCallback() {
    this.#observer?.disconnect()
    this.#observer = null
    // The probes this key vouched for die with the disconnect; a reconnect
    // must measure against its own fresh ones rather than trust this key.
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
    // Probe elements exist only after #render() has mounted the DOM.
    queueMicrotask(() => {
      const row = this.#rowEl
      if (row === null) return
      this.#measure()
      if (typeof ResizeObserver === 'undefined') return
      // Observe the row and the chip probes only -- `remainderProbe` (the
      // `#moreProbeEl`) resizes SOLELY because #measure() writes its own
      // textContent into it on the same synchronous pass that reads chip
      // widths (line 98 above); observing it too fed that write back into
      // another #measure() call, a self-triggering resize loop the browser's
      // own "ResizeObserver loop limit exceeded" guard eventually cuts off,
      // but only after real, repeated layout-thrashing cost -- measured live
      // as part of a 29-second input-delay stall with 18 of these elements
      // mounted at once. #measure() already reads the remainder probe's
      // fresh width synchronously right after writing it, so no observer is
      // needed for it: only the row (a genuine external resize signal) and
      // the chip probes (whose width changes only from font/content
      // changes we do not control) need one.
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
            // The full path is the disambiguator when two turns produce files
            // that share a basename; the chip itself stays short.
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

if (typeof customElements !== 'undefined' && customElements.get('freddie-produced-files') === undefined) {
  customElements.define('freddie-produced-files', FreddieProducedFiles)
}
