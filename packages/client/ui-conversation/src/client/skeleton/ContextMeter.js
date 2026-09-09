/** Composer context-occupancy meter: a ring beside the send button fed by the
 * `contextPressure` projection, with a click-open panel of the heuristic
 * `contextBreakdown` composition (system prompt, tools, conversation).
 * Renders nothing until a provider reports both pressure and a route
 * capacity.
 *
 * Converted from a React hooks component to a webjsx custom element:
 * open/rootRef become instance fields, the availability-close and
 * outside-click/Escape-close effects become connectedCallback/
 * disconnectedCallback plus explicit bind/unbind pairs, and re-render is an
 * explicit applyDiff(this, vdom) call (Toast.tsx's pattern). */

import { applyDiff, createElement as h } from 'webjsx'
import { renderTooltip } from '@freddie/freddie-client-ui-primitives'
import { contextOccupancy, formatTokens } from '../chat/StatsLine.js'
import css from './ContextMeter.css.js'

/** Ring geometry: 14px viewBox, 2px stroke. */
const RADIUS = 5.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Marker the localized occupancy sentence is split on, so the panel headline
 * keeps the reading in its own tone while each locale still owns the word
 * order (`45% of context used` / `上下文已用 45%`).
 */
const READING_SLOT = ' '

/** Panel legend rows, in bar-segment order; each color class carries the shared swatch/segment tint. */
const ROWS = [
  { key: 'systemTokens', label: 'context.system', color: css.colorSystem },
  { key: 'toolsTokens', label: 'context.tools', color: css.colorTools },
  { key: 'messageTokens', label: 'context.messages', color: css.colorMessages },
]

export class FreddieContextMeter extends HTMLElement {
  #props = null
  #open = false
  #outsideHandler = null
  #keyHandler = null
  #tooltipEl = null

  setProps(props) {
    this.#props = props
    this.#syncAvailability()
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    this.#unbindOutsideClose()
  }

  #syncAvailability() {
    if (this.#props === null) return
    const pressure = this.#props.useProjection('contextPressure')
    const context = contextOccupancy(pressure)
    if (context === null && this.#open) this.#setOpen(false)
  }

  #setOpen(open) {
    if (open === this.#open) return
    this.#open = open
    if (open) this.#bindOutsideClose()
    else this.#unbindOutsideClose()
    this.#render()
  }

  #bindOutsideClose() {
    this.#unbindOutsideClose()
    const onPointerDown = (e) => {
      if (e.target instanceof Node && this.contains(e.target)) return
      this.#setOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') this.#setOpen(false)
    }
    this.#outsideHandler = onPointerDown
    this.#keyHandler = onKeyDown
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
  }

  #unbindOutsideClose() {
    if (this.#outsideHandler !== null) {
      document.removeEventListener('pointerdown', this.#outsideHandler)
      this.#outsideHandler = null
    }
    if (this.#keyHandler !== null) {
      document.removeEventListener('keydown', this.#keyHandler)
      this.#keyHandler = null
    }
  }

  #render() {
    if (this.#props === null) return
    const { useProjection, t } = this.#props
    const pressure = useProjection('contextPressure')
    const breakdown = useProjection('contextBreakdown')
    const context = contextOccupancy(pressure)
    const open = this.#open

    if (context === null) {
      applyDiff(this, h('span', { class: css.root ?? '' }))
      return
    }

    const percent = context.percent
    const reading = `${percent}%`
    const [headBefore = '', headAfter = ''] = t('context.aria', { percent: READING_SLOT })
      .split(READING_SLOT)
      .map(part => part.trim())

    const breakdownTotal = breakdown === undefined
      ? 0
      : breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens
    const parts = breakdown === undefined || breakdownTotal === 0
      ? [{ key: 'total', color: undefined, width: percent }]
      : ROWS.map(row => ({ key: row.key, color: row.color, width: percent * breakdown[row.key] / breakdownTotal }))
    const segments = parts.filter(part => part.width > 0)

    // h(Tooltip, {...}) calls Tooltip(props) synchronously (webjsx's
    // function-component branch), Tooltip.js's bare one-shot factory --
    // recreating the freddie-tooltip element (dropping its in-flight #showTimer
    // hover-delay) on every #render(). renderTooltip(cached, props) reuses it.
    this.#tooltipEl = renderTooltip(this.#tooltipEl, {
      label: t('context.aria', { percent: reading }), side: 'top', delayMs: 200, disabled: open,
      children: [
        h('button',
          {
            type: 'button',
            class: css.trigger ?? '',
            'aria-label': t('context.aria', { percent: reading }),
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            onclick: () => { this.#setOpen(!open) },
          },
          h('svg', { viewBox: '0 0 14 14', width: '14', height: '14', 'aria-hidden': true },
            h('circle', { key: 'track', class: css.track ?? '', cx: '7', cy: '7', r: String(RADIUS) }),
            h('circle',
              {
                key: 'fill',
                class: css.fill ?? '',
                cx: '7',
                cy: '7',
                r: String(RADIUS),
                'stroke-dasharray': `${CIRCUMFERENCE * percent / 100} ${CIRCUMFERENCE}`,
                transform: 'rotate(-90 7 7)',
              },
            ),
          ),
        ),
      ],
    })
    const vdom = (
      h('span', { class: css.root ?? '' },
        this.#tooltipEl,
        open && (
          h('div', { class: css.panel ?? '', role: 'dialog', 'aria-label': t('context.used') },
            h('div', { class: css.header ?? '' },
              // Empty sides collapse through `.headline:empty` so the locale that
              // needs no leading (or trailing) text spends no header gap.
              h('span', { class: css.headline ?? '' }, headBefore),
              h('span', { class: css.percent ?? '' }, reading),
              h('span', { class: css.headline ?? '' }, headAfter),
              h('span', { class: css.figures ?? '' },
                `~${formatTokens(context.usedTokens)} / ${formatTokens(context.contextWindow)}`,
              ),
            ),
            h('div', { class: css.bar ?? '' },
              segments.map(segment => (
                h('div', {
                  key: segment.key,
                  class: segment.color === undefined ? (css.segment ?? '') : `${css.segment} ${segment.color}`,
                  style: `width: ${segment.width}%`,
                })
              )),
            ),
            breakdown !== undefined && (
              h('dl', { class: css.rows ?? '' },
                ROWS.map(row => (
                  h('div', { key: row.key, class: css.row ?? '' },
                    h('dt', null,
                      h('span', { class: `${css.swatch} ${row.color}`, 'aria-hidden': true }),
                      t(row.label),
                    ),
                    h('dd', null, `~${formatTokens(breakdown[row.key])}`),
                  )
                )),
              )
            ),
          )
        ),
      )
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-context-meter') === undefined) {
  customElements.define('freddie-context-meter', FreddieContextMeter)
}

/** One-shot creation/update helper preserving the original function-component call shape. */
export function ContextMeter(props) {
  const el = document.createElement('freddie-context-meter')
  el.setProps(props)
  return el
}
