/** Chrome-Network-style overview timeline for focusing the trajectory ledger. */

import { applyDiff, createElement as h } from 'webjsx'
import { renderTooltip } from '@freddie/freddie-client-ui-primitives'
import {
  deriveTrajectoryTimeline,
  formatTimelineOffset,
} from './timeline.js'
import css from './TrajectoryTimeline.css.js'

const MINIMUM_DRAG_PX = 3
const MINIMUM_ZOOM_OPERATIONS = 4
const EDGE_PAN_ZONE_FRACTION = 0.08
const EDGE_PAN_STEP_FRACTION = 0.025
const MAXIMUM_EDGE_PAN_PX = 32
const TIMELINE_TOOLTIP_DELAY_MS = 500

function assistantTimingDetail(
  metrics,
) {
  const start = metrics?.stepStartTime
  const first = metrics?.firstTokenTime
  const completed = metrics?.completedTime
  if (
    metrics?.timingRecorded !== true
    || typeof start !== 'number'
    || typeof first !== 'number'
    || typeof completed !== 'number'
    || !Number.isFinite(start)
    || !Number.isFinite(first)
    || !Number.isFinite(completed)
    || first < start
    || completed < first
  ) return {}
  return { ttftMs: first - start, decodingMs: completed - first }
}

function timelineRecordDetail(cell) {
  const durationMs = cell.timeSeconds === null || !Number.isFinite(cell.timeSeconds)
    ? undefined
    : Math.max(0, cell.timeSeconds * 1_000)
  const startedAt = cell.startedAt === null || !Number.isFinite(cell.startedAt)
    ? undefined
    : cell.startedAt
  return {
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...assistantTimingDetail(cell.assistantMetrics),
  }
}

function timelineKindLabel(kind) {
  switch (kind) {
    case 'system': return 'SYSTEM'
    case 'user': return 'USER'
    case 'context': return 'CONTEXT'
    case 'compacted': return 'COMPACTED'
    case 'message': return 'ASSISTANT'
    case 'tool': return 'TOOL'
    case 'subtool': return 'SUBTOOL'
  }
}

function formatRecordedTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  })
}

function timelineTooltipLabel(
  kind,
  detail,
) {
  const heading = timelineKindLabel(kind)
  if (detail === undefined) return heading
  const duration = detail.durationMs === undefined
    ? null
    : `Total ${formatTimelineOffset(detail.durationMs)}`
  const range = detail.startedAt === undefined
    ? null
    : detail.durationMs === undefined
      ? `Started ${formatRecordedTime(detail.startedAt)}`
      : `${formatRecordedTime(detail.startedAt)} → ${formatRecordedTime(
        detail.startedAt + detail.durationMs,
      )}`
  const segments = detail.ttftMs === undefined || detail.decodingMs === undefined
    ? null
    : `TTFT ${formatTimelineOffset(detail.ttftMs)} · Decoding ${formatTimelineOffset(
      detail.decodingMs,
    )}`
  const timing = [duration, segments].filter(value => value !== null).join(' · ')
  return [heading, range, timing].filter(value => value !== null && value !== '').join('\n')
}

function orderedRange(left, right) {
  return left <= right ? { start: left, end: right } : { start: right, end: left }
}

function clampFraction(value) {
  return Math.min(1, Math.max(0, value))
}

function centeredRange(
  center,
  width,
  minimum,
  maximum,
) {
  const clampedWidth = Math.min(maximum - minimum, Math.max(0, width))
  const start = Math.min(
    Math.max(center - clampedWidth / 2, minimum),
    maximum - clampedWidth,
  )
  return { start, end: start + clampedWidth }
}

function rangeFraction(
  range,
  start,
  duration,
  minimum,
  maximum,
) {
  const bounded = orderedRange(
    Math.min(maximum, Math.max(minimum, range.start)),
    Math.min(maximum, Math.max(minimum, range.end)),
  )
  return {
    start: (bounded.start - start) / duration,
    end: (bounded.end - start) / duration,
  }
}

function LaneLabels() {
  return (
    h('div', {class: css.labels ?? '', 'aria-hidden': 'true'},
      h('span', null, 'Input'),
      h('span', null, 'Model'),
      h('span', null, 'Tools'),
    )
  )
}

function EarlierHistoryBoundary({
  loading,
  onHover,
  onLoad,
  tooltip,
}) {
  return (
    tooltip('earlierHistory', {
      label: loading ? 'Loading earlier history…' : 'Click to load earlier history',
      side: 'right',
      delayMs: TIMELINE_TOOLTIP_DELAY_MS,
    },
      h('button', {
        type: 'button',
        class: css.earlierHistory ?? '',
        'data-earlier-history': '',
        'data-loading': loading || undefined,
        'aria-label': loading ? 'Loading earlier history' : 'Load earlier history',
        'aria-disabled': loading || onLoad === undefined,
        onclick: onLoad ?? null,
        onpointerenter: (event) => {
          event.stopPropagation()
          onHover()
        },
        onpointermove: (event) => { event.stopPropagation() },
        onpointerdown: (event) => { event.stopPropagation() },
      },
        '…',
      ),
    )
  )
}

function cssVarStyle(vars) {
  return Object.entries(vars)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('; ')
}

/** Overview renderer with drag ranges, click-sized focus, and Escape reset — a custom element. */
export class FreddieTrajectoryTimeline extends HTMLElement {
  #props = {
    turns: [], mode: 'sequence', range: null, onRangeChange: () => {},
  }

  #drag = null
  #pan = null
  #trackEl = null
  #wheelHandler = null

  #draft = null
  #hover = null
  #loadingEarlier = false
  #panning = false
  #viewport = null
  #animateViewport = false
  #tooltips = new Map()

  // h(Tooltip, {...}) calls Tooltip(props) synchronously (webjsx's
  // function-component branch), Tooltip.js's bare one-shot factory --
  // recreating the freddie-tooltip element (dropping its in-flight #showTimer
  // hover-delay) on every #render(), which fires on every drag/hover/pan
  // frame. `key` is per-call-site for the earlier-history boundary, or
  // span.index for the per-span tooltips in the spans .map(). A stale key
  // from a since-removed span is harmless: it just sits unused in the Map.
  #tooltip(key, props, ...children) {
    const el = renderTooltip(this.#tooltips.get(key) ?? null, { ...props, children })
    this.#tooltips.set(key, el)
    return el
  }

  setProps(props) {
    this.#props = props
    this.#syncEffects()
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    this.#unbindWheel()
  }

  #syncEffects() {
    const { turns, mode, range, onRangeChange, selectedIndex = null } = this.#props
    const model = deriveTrajectoryTimeline(turns, mode)
    if (
      model !== null
      && range !== null
      && (range.end < model.start || range.start > model.end)
    ) {
      onRangeChange(null)
      return
    }
    if (model === null) {
      this.#animateViewport = false
      if (
        this.#viewport !== null
        && (this.#viewport.end < 0 || this.#viewport.start > 0)
      ) this.#viewport = null
      return
    }
    if (
      this.#viewport !== null
      && (this.#viewport.end < model.start || this.#viewport.start > model.end)
    ) this.#viewport = null
    if (selectedIndex !== null) {
      const selectedSpan = model.spans.find(span => span.index === selectedIndex)
      if (selectedSpan !== undefined) {
        this.#animateViewport = true
        const current = this.#viewport
        if (current !== null) {
          const overlaps = selectedSpan.end > current.start && selectedSpan.start < current.end
          if (!overlaps) {
            const duration = Math.max(1, current.end - current.start)
            const desiredStart = selectedSpan.end <= current.start
              ? selectedSpan.start
              : selectedSpan.end - duration
            const nextStart = Math.min(
              Math.max(desiredStart, model.start),
              Math.max(model.start, model.end - duration),
            )
            if (nextStart !== current.start) {
              this.#viewport = { start: nextStart, end: nextStart + duration }
            }
          }
        }
      }
    }
  }

  #bindWheel() {
    this.#unbindWheel()
    const onWheel = (event) => {
      event.preventDefault()
      const { turns, mode } = this.#props
      const model = deriveTrajectoryTimeline(turns, mode)
      const track = this.#trackEl
      if (track === null || model === null) return
      const fullDuration = Math.max(1, model.end - model.start)
      const domainDuration = this.#viewport === null
        ? fullDuration
        : Math.min(fullDuration, Math.max(1, this.#viewport.end - this.#viewport.start))
      const domainStart = this.#viewport === null
        ? model.start
        : Math.min(Math.max(this.#viewport.start, model.start), model.end - domainDuration)
      this.#animateViewport = false
      const rect = track.getBoundingClientRect()
      const anchorFraction = clampFraction((event.clientX - rect.left) / Math.max(1, rect.width))
      const nextDuration = Math.min(
        fullDuration,
        Math.max(
          Math.min(mode === 'sequence' ? MINIMUM_ZOOM_OPERATIONS : 20, fullDuration),
          domainDuration * Math.exp(event.deltaY * 0.0015),
        ),
      )
      if (nextDuration >= fullDuration * 0.999) {
        this.#viewport = null
        this.#render()
        return
      }
      const anchorTime = domainStart + anchorFraction * domainDuration
      const nextStart = Math.min(
        Math.max(anchorTime - anchorFraction * nextDuration, model.start),
        model.end - nextDuration,
      )
      this.#viewport = { start: nextStart, end: nextStart + nextDuration }
      this.#render()
    }
    this.#wheelHandler = onWheel
    this.addEventListener('wheel', onWheel, { passive: false })
  }

  #unbindWheel() {
    if (this.#wheelHandler === null) return
    this.removeEventListener('wheel', this.#wheelHandler)
    this.#wheelHandler = null
  }

  #fractionAt(event) {
    const rect = (event.currentTarget).getBoundingClientRect()
    return clampFraction((event.clientX - rect.left) / Math.max(1, rect.width))
  }

  #recordIndexAt(event) {
    const target = event.target instanceof HTMLElement ? event.target : null
    const value = target?.closest('[data-timeline-record-index]')
      ?.dataset.timelineRecordIndex
    if (value === undefined) return null
    const index = Number(value)
    return Number.isFinite(index) ? index : null
  }

  #render() {
    const {
      turns, mode, range, hasEarlierRecords = false, onLoadEarlier,
      selectedIndex = null, searchMatchIndexes = null, onRangeChange,
      onRecordSelect, onRecordFocus,
    } = this.#props
    const model = deriveTrajectoryTimeline(turns, mode)
    const detailByIndex = new Map(turns.flatMap(turn =>
      turn.groups.flatMap(group =>
        group.cells.map(cell => [cell.index, timelineRecordDetail(cell)]),
      ),
    ))

    if (model === null) {
      const loadEarlier = onLoadEarlier === undefined || this.#loadingEarlier
        ? undefined
        : () => {
          this.#loadingEarlier = true
          this.#render()
          void onLoadEarlier().finally(() => { this.#loadingEarlier = false; this.#render() })
        }
      const vdom = (
        h('section', {class: css.root ?? '', 'aria-label': 'Trajectory timeline'},
          h('div', {class: css.plot ?? ''},
            h(LaneLabels, null),
            h('div', {class: css.track ?? ''},
              h('span', {class: css.empty ?? ''}, 'No timing data'),
              hasEarlierRecords
                ? h(EarlierHistoryBoundary, {
                  loading: this.#loadingEarlier,
                  onHover: () => { this.#hover = null; this.#render() },
                  onLoad: loadEarlier,
                  tooltip: this.#tooltip.bind(this),
                })
                : null,
            ),
          ),
        )
      )
      applyDiff(this, vdom)
      this.#trackEl = null
      this.#unbindWheel()
      return
    }

    const fullDuration = Math.max(1, model.end - model.start)
    const viewportDuration = Math.min(
      fullDuration,
      Math.max(1, (this.#viewport?.end ?? 0) - (this.#viewport?.start ?? 0)),
    )
    const viewportStart = this.#viewport === null
      ? model.start
      : Math.min(
        Math.max(this.#viewport.start, model.start),
        model.end - viewportDuration,
      )
    const domainDuration = this.#viewport === null ? fullDuration : viewportDuration
    const domainStart = this.#viewport === null ? model.start : viewportStart
    const showsEarlierBoundary = hasEarlierRecords && domainStart === model.start
    const loadEarlier = onLoadEarlier === undefined || this.#loadingEarlier
      ? undefined
      : () => {
        this.#loadingEarlier = true
        this.#render()
        void onLoadEarlier().finally(() => { this.#loadingEarlier = false; this.#render() })
      }
    const projectedDomainStyle = cssVarStyle({
      '--trajectory-domain-left': `${-(domainStart - model.start) / domainDuration * 100}%`,
      '--trajectory-domain-width': `${fullDuration / domainDuration * 100}%`,
    })
    const committed = range === null
      ? null
      : rangeFraction(range, domainStart, domainDuration, model.start, model.end)
    const draftFraction = this.#draft === null
      ? null
      : rangeFraction(this.#draft, domainStart, domainDuration, model.start, model.end)
    const visibleRange = draftFraction ?? committed
    const activeRange = this.#draft ?? range
    const draft = this.#draft
    const hover = this.#hover
    const panning = this.#panning
    const animateViewport = this.#animateViewport

    const minimumSelectionDuration = Math.min(
      domainDuration,
      fullDuration / model.spans.length,
    )

    const commit = (nextRange) => {
      onRangeChange(nextRange)
    }

    const onPointerDown = (event) => {
      if (event.button === 2) {
        this.#pan = {
          anchorClientX: event.clientX,
          anchorStart: domainStart,
          moved: false,
          pannable: this.#viewport !== null,
          pointerId: event.pointerId,
        }
        if (this.#viewport !== null) this.#animateViewport = false
        this.#panning = true
        const target = event.currentTarget
        if (typeof target.setPointerCapture === 'function') {
          target.setPointerCapture(event.pointerId)
        }
        this.#render()
        return
      }
      if (event.button !== 0) return
      const anchor = this.#fractionAt(event)
      const anchorTime = domainStart + anchor * domainDuration
      const recordIndex = this.#recordIndexAt(event)
      this.#hover = { fraction: anchor, recordIndex }
      this.#drag = {
        pointerId: event.pointerId,
        anchorTime,
        anchorClientX: event.clientX,
        recordIndex,
      }
      const target = event.currentTarget
      if (typeof target.setPointerCapture === 'function') {
        target.setPointerCapture(event.pointerId)
      }
      this.#draft = { start: anchorTime, end: anchorTime }
      this.#render()
    }

    const onPointerMove = (event) => {
      const rect = (event.currentTarget).getBoundingClientRect()
      const fraction = this.#fractionAt(event)
      this.#hover = { fraction, recordIndex: this.#recordIndexAt(event) }
      const pan = this.#pan
      if (pan !== null && pan.pointerId === event.pointerId) {
        if (Math.abs(event.clientX - pan.anchorClientX) >= MINIMUM_DRAG_PX) {
          pan.moved = true
        }
        if (!pan.pannable) { this.#render(); return }
        const delta = (event.clientX - pan.anchorClientX) / Math.max(1, rect.width)
        const nextStart = Math.min(
          Math.max(pan.anchorStart - delta * domainDuration, model.start),
          model.end - domainDuration,
        )
        this.#viewport = { start: nextStart, end: nextStart + domainDuration }
        this.#render()
        return
      }
      const drag = this.#drag
      if (drag === null || drag.pointerId !== event.pointerId) { this.#render(); return }
      let nextDomainStart = domainStart
      if (this.#viewport !== null) {
        const localX = event.clientX - rect.left
        const edgeWidth = Math.min(
          MAXIMUM_EDGE_PAN_PX,
          Math.max(1, rect.width * EDGE_PAN_ZONE_FRACTION),
        )
        const direction = localX < edgeWidth
          ? -1
          : localX > rect.width - edgeWidth ? 1 : 0
        if (direction !== 0) {
          const edgeDistance = direction < 0
            ? edgeWidth - localX
            : localX - (rect.width - edgeWidth)
          const strength = clampFraction(edgeDistance / edgeWidth)
          const desiredStart = domainStart
            + direction * domainDuration * EDGE_PAN_STEP_FRACTION
            * Math.max(0.2, strength)
          nextDomainStart = Math.min(
            Math.max(desiredStart, model.start),
            model.end - domainDuration,
          )
          if (nextDomainStart !== domainStart) {
            this.#animateViewport = false
            this.#viewport = {
              start: nextDomainStart,
              end: nextDomainStart + domainDuration,
            }
          }
        }
      }
      const pointTime = nextDomainStart + fraction * domainDuration
      this.#draft = orderedRange(drag.anchorTime, pointTime)
      this.#render()
    }

    const onPointerEnd = (event) => {
      const pan = this.#pan
      if (pan !== null && pan.pointerId === event.pointerId) {
        const moved = pan.moved
          || Math.abs(event.clientX - pan.anchorClientX) >= MINIMUM_DRAG_PX
        this.#pan = null
        this.#panning = false
        if (!moved) { onRangeChange(null); return }
        this.#render()
        return
      }
      const drag = this.#drag
      if (drag === null || drag.pointerId !== event.pointerId) return
      const pointFraction = this.#fractionAt(event)
      const pointTime = domainStart + pointFraction * domainDuration
      const selected = orderedRange(drag.anchorTime, pointTime)
      this.#hover = { fraction: pointFraction, recordIndex: this.#recordIndexAt(event) }
      this.#drag = null
      this.#draft = null
      const click = Math.abs(event.clientX - drag.anchorClientX) < MINIMUM_DRAG_PX
      const clickedSpan = click && drag.recordIndex !== null
        ? model.spans.find(span => span.index === drag.recordIndex)
        : undefined
      if (clickedSpan !== undefined) {
        onRangeChange(null)
        onRecordSelect?.(clickedSpan.index)
        this.#render()
        return
      }
      const committedRange = selected.end - selected.start < minimumSelectionDuration
        ? centeredRange(
          click ? selected.start : (selected.start + selected.end) / 2,
          minimumSelectionDuration,
          model.start,
          model.end,
        )
        : selected
      commit(committedRange)
      if (click) {
        const timelinePoint = selected.start
        const nearest = model.spans.reduce((candidate, span) => {
          const candidateDistance = timelinePoint < candidate.start
            ? candidate.start - timelinePoint
            : timelinePoint > candidate.end ? timelinePoint - candidate.end : 0
          const spanDistance = timelinePoint < span.start
            ? span.start - timelinePoint
            : timelinePoint > span.end ? timelinePoint - span.end : 0
          return spanDistance < candidateDistance ? span : candidate
        })
        onRecordFocus?.(nearest.index)
      }
      this.#render()
    }

    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || range === null) return
      event.preventDefault()
      onRangeChange(null)
    }

    const onPointerCancel = () => {
      this.#drag = null
      this.#pan = null
      this.#draft = null
      this.#hover = null
      this.#panning = false
      this.#render()
    }

    const vdom = (
      h('section', {class: css.root ?? '', 'aria-label': 'Trajectory timeline'},
        h('div', {class: css.plot ?? ''},
          h(LaneLabels, null),
          h('div', {
            class: css.track ?? '',
            'data-panning': panning || undefined,
            'aria-label': 'Timeline overview; drag horizontally to focus events',
            tabIndex: 0,
            onkeydown: onKeyDown,
            onpointerdown: onPointerDown,
            onpointermove: onPointerMove,
            onpointerup: onPointerEnd,
            onpointercancel: onPointerCancel,
            onpointerleave: () => {
              if (this.#drag === null && this.#pan === null) { this.#hover = null; this.#render() }
            },
            ondblclick: (event) => {
              event.preventDefault()
              onRangeChange(null)
            },
            oncontextmenu: (event) => {
              event.preventDefault()
            },
          },
            showsEarlierBoundary
              ? h(EarlierHistoryBoundary, {
                loading: this.#loadingEarlier,
                onHover: () => { this.#hover = null; this.#render() },
                onLoad: loadEarlier,
                tooltip: this.#tooltip.bind(this),
              })
              : null,
            hover !== null && hover.recordIndex === null && draft === null
              ? h('div', {
                class: css.hoverLine ?? '',
                'data-timeline-hover-line': '',
                'aria-hidden': 'true',
                style: cssVarStyle({ '--trajectory-hover-left': `${hover.fraction * 100}%` }),
              })
              : null,
            visibleRange !== null
              ? [
                h('div', {
                  class: css.selection ?? '',
                  'data-dragging': draft === null ? undefined : 'true',
                  'aria-hidden': 'true',
                  style: cssVarStyle({
                    '--trajectory-selection-left': `${visibleRange.start * 100}%`,
                    '--trajectory-selection-width': `${(visibleRange.end - visibleRange.start) * 100}%`,
                  }),
                }),
                h('div', {
                  class: css.selectionEdges ?? '',
                  'data-dragging': draft === null ? undefined : 'true',
                  'aria-hidden': 'true',
                  style: cssVarStyle({
                    '--trajectory-selection-left': `${visibleRange.start * 100}%`,
                    '--trajectory-selection-width': `${(visibleRange.end - visibleRange.start) * 100}%`,
                  }),
                }),
              ]
              : null,
            h('div', {
              class: css.turnBoundaries ?? '',
              'data-animate-viewport': animateViewport || undefined,
              'aria-hidden': 'true',
              style: projectedDomainStyle,
            },
              model.turnBoundaries
                .filter(boundary =>
                  boundary.time > model.start
                  && boundary.time >= domainStart
                  && boundary.time <= domainStart + domainDuration)
                .map(boundary => (
                  h('span', {
                    class: css.turnBoundary ?? '',
                    'data-turn': boundary.turn,
                    key: boundary.turn,
                    style: cssVarStyle({
                      '--trajectory-turn-left': `${(boundary.time - model.start) / fullDuration * 100}%`,
                    }),
                  })
                )),
            ),
            h('div', {
              class: css.lanes ?? '',
              'data-animate-viewport': animateViewport || undefined,
              'data-timeline-domain': '',
              style: projectedDomainStyle,
            },
              model.spans
                .filter(span =>
                  span.index === selectedIndex
                  || (span.end >= domainStart && span.start <= domainStart + domainDuration))
                .map((span) => {
                  const left = (span.start - model.start) / fullDuration
                  const width = (span.end - span.start) / fullDuration
                  const widthPercent = width * 100
                  const detail = detailByIndex.get(span.index)
                  const ttftMs = detail?.ttftMs
                  const decodingMs = detail?.decodingMs
                  const ttftFraction = ttftMs === undefined
                    || decodingMs === undefined
                    || ttftMs + decodingMs <= 0
                    ? null
                    : ttftMs / (ttftMs + decodingMs)
                  return (
                    this.#tooltip(span.index, {
                      label: () => timelineTooltipLabel(span.kind, detail),
                      side: 'bottom',
                      delayMs: TIMELINE_TOOLTIP_DELAY_MS,
                    },
                      h('span', {
                        'aria-hidden': 'true',
                        class: css.span ?? '',
                        'data-timeline-span': span.kind,
                        'data-timeline-record-index': span.index,
                        'data-assistant-timing': ttftFraction === null ? undefined : 'true',
                        'data-error': span.isError || undefined,
                        'data-equal-duration': mode === 'time' || undefined,
                        'data-current': span.index === selectedIndex || undefined,
                        'data-hovered': hover?.recordIndex === span.index || undefined,
                        'data-search-match': searchMatchIndexes === null
                          ? undefined
                          : searchMatchIndexes.has(span.index) ? 'true' : 'false',
                        'data-selected': activeRange === null
                          ? undefined
                          : span.start <= activeRange.end && span.end >= activeRange.start
                            ? 'true'
                            : 'false',
                        style: cssVarStyle({
                          '--trajectory-span-left': `${left * 100}%`,
                          '--trajectory-span-width': `${widthPercent}%`,
                          '--trajectory-span-gap': `min(${widthPercent * 0.08}%, 1px)`,
                          '--trajectory-span-lane': span.lane,
                          ...(ttftFraction === null
                            ? {}
                            : { '--trajectory-assistant-ttft': `${ttftFraction * 100}%` }),
                        }),
                      }),
                    )
                  )
                }),
            ),
          ),
        ),
      )
    )
    applyDiff(this, vdom)
    this.#trackEl = this.querySelector(`.${css.track}`)
    this.#bindWheel()
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-trajectory-timeline') === undefined) {
  customElements.define('freddie-trajectory-timeline', FreddieTrajectoryTimeline)
}

/** Create and mount a TrajectoryTimeline element in place of the old function-component call. */
export function TrajectoryTimeline(props) {
  const el = document.createElement('freddie-trajectory-timeline')
  el.setProps(props)
  return el
}
