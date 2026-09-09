// Settled-node identity prevents stream-delta updates from rerendering this row.
// Mounted on 'conversation.composer.dock' so it sticks with the composer in the
// active conversation scrollport (see ConversationRoot data-conversation-scroll).
//
// Converted from a React hooks component to a webjsx custom element:
// truncated useState and rootRef useRef become private fields, the
// ResizeObserver useLayoutEffect becomes connectedCallback/
// disconnectedCallback plus an explicit re-bind after each render, and
// re-render is an explicit applyDiff(this, vdom) call. Avoid <Fragment> JSX
// tags — the group list uses a plain array instead.

import { applyDiff, createElement as h } from 'webjsx'
import { renderTooltip } from '@freddie/freddie-client-ui-primitives'
import { formatTokensPerSecond } from './message-chrome.js'
import { assistantStepReading } from './turn-metrics.js'
import css from './StatsLine.css.js'

/**
 * Fold assistant and tool-result nodes into window-scoped display totals —
 * the FALLBACK for assemblies without the `sessionStats` projection.
 *
 * Every displayed figure rides that durable whole-log projection (and token
 * accounting rides `tokenUsage`) because the window is paged and compaction
 * rewrites it; this fold answers "what is on screen" only when no projection
 * value is served. Its field names deliberately mirror the projection's so
 * the two swap wholesale.
 * @param nodes - snapshot nodes.
 * @returns fallback counts and summed wall times.
 */
export function deriveStats(nodes) {
  const turns = new Set()
  let steps = 0
  let llmMs = 0
  let toolMs = 0
  let ttftMs = 0
  let ttftSteps = 0
  let decodeMs = 0
  let decodeTokens = 0
  for (const node of nodes) {
    if (node.kind === 'tool-result') {
      if (node.callTime !== null) toolMs += Math.max(0, node.time - node.callTime)
      continue
    }
    if (node.kind !== 'assistant') continue
    turns.add(node.turn)
    steps += 1
    if (node.timing !== undefined && node.timing.stepStartTime !== null) {
      llmMs += Math.max(0, node.timing.completedTime - node.timing.stepStartTime)
    }
    const reading = assistantStepReading(node)
    if (reading.ttftMs !== null) {
      ttftMs += reading.ttftMs
      ttftSteps += 1
    }
    if (reading.decodeMs !== null && reading.outputTokens !== null) {
      decodeMs += reading.decodeMs
      decodeTokens += reading.outputTokens
    }
  }
  return { turns: turns.size, steps, llmMs, toolMs, ttftMs, ttftSteps, decodeMs, decodeTokens }
}

/**
 * Compact token count: 517 / 12.2K / 517K / 1.2M (one decimal under three digits).
 * @param n - token count.
 * @returns display string.
 */
export function formatTokens(n) {
  const scaled = (v) =>
    v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${scaled(n / 1_000)}K`
  return `${scaled(n / 1_000_000)}M`
}

/**
 * Compact duration: 45.2s under a minute, 2m42s from there on.
 * @param ms - duration in milliseconds.
 * @returns display string.
 */
export function formatDuration(ms) {
  const s = ms / 1_000
  if (s < 60) return `${Math.round(s * 10) / 10}s`
  const whole = Math.round(s)
  return `${Math.floor(whole / 60)}m${whole % 60}s`
}

/** Round a cache-read ratio to an integer percentage, with positive ties rounded up. */
function roundedIntegerPercent(cacheReadTokens, denominator) {
  const denominatorQuotient = Math.floor(denominator / 200)
  const denominatorRemainder = denominator % 200
  let lower = 0
  let upper = 100
  while (lower < upper) {
    const candidate = Math.floor((lower + upper + 1) / 2)
    const factor = candidate * 2 - 1
    const threshold = factor * denominatorQuotient
      + Math.ceil(factor * denominatorRemainder / 200)
    if (cacheReadTokens >= threshold) {
      lower = candidate
    } else {
      upper = candidate - 1
    }
  }
  return lower
}

/**
 * Display-ready cache-hit share of prompt-side input over the whole durable log.
 * @param usage - the session's token-usage projection value.
 * @returns integer text when integer rounding stays below 100, otherwise the
 * minimum decimal precision that still rounds below 100; a full hit returns
 * 100, and no billed input returns null.
 */
export function cacheHitPercent(usage) {
  const denominator = billedInputTokens(usage)
  if (denominator === 0) return null
  const missedInputTokens = usage.uncachedInputTokens + usage.cacheWriteTokens
  if (missedInputTokens === 0) return '100'

  const integerPercent = roundedIntegerPercent(usage.cacheReadTokens, denominator)
  if (integerPercent < 100) return String(integerPercent)

  // At the first distinguishing precision, the rounded result is 100 minus
  // one to five units in the final decimal place. Scale only while the next
  // multiplication remains at or below the denominator, then derive that
  // final digit through exact small-factor comparisons.
  let decimalPlaces = 1
  let scaledDoubleGap = missedInputTokens * 200
  const denominatorTens = Math.floor(denominator / 10)
  while (scaledDoubleGap <= denominatorTens) {
    scaledDoubleGap *= 10
    decimalPlaces += 1
  }
  const denominatorOnes = denominator % 10
  let roundedLoss = 5
  for (let loss = 1; loss < 5; loss += 1) {
    const factor = loss * 2 + 1
    const threshold = factor * denominatorTens + Math.floor(factor * denominatorOnes / 10)
    if (scaledDoubleGap <= threshold) {
      roundedLoss = loss
      break
    }
  }
  return `99.${'9'.repeat(decimalPlaces - 1)}${10 - roundedLoss}`
}

/**
 * Sum the three disjoint prompt-side billing buckets.
 * @param usage - the session's token-usage projection value.
 * @returns billed input tokens.
 */
export function billedInputTokens(usage) {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/**
 * Approximate context occupancy, using the TUI's integer rounding and upper
 * clamp. The numerator is `projectedTokens` — the provider sample carried
 * forward over the surface's movement since — so compaction shows immediately
 * instead of waiting for the next request to report usage; it falls back to the
 * bare sample only for a log whose projection predates that field. Numerator
 * and capacity remain independent last-wins projection fields, so this is a
 * reference figure rather than an exact measurement of one request (see the
 * token-meter README).
 * @param pressure - the session's context-pressure projection value.
 * @returns occupancy with its numerator and denominator, or null until both values are known.
 */
export function contextOccupancy(pressure) {
  const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens
  if (usedTokens === undefined || pressure?.contextWindow === undefined) return null
  return {
    percent: Math.min(100, Math.round(usedTokens / pressure.contextWindow * 100)),
    usedTokens,
    contextWindow: pressure.contextWindow,
  }
}

/** Props: the conversation-snapshot selector plus the projection read seat. */

const DEFAULT_PROPS = {
  useSession: (() => { throw new Error('StatsLine: useSession not wired') }),
  useProjection: (() => undefined),
  t: (key) => key,
}

/** Elided stats strip custom element, with a delayed hover tooltip carrying the full line. */
export class FreddieStatsLine extends HTMLElement {
  #props = DEFAULT_PROPS
  #truncated = false
  #resizeObserver = null
  #resizeRoot = null
  #unsubscribe = null
  #tooltipEl = null

  setProps(props) {
    this.#props = props
    this.#bindSession()
    this.#render()
  }

  connectedCallback() {
    this.#bindSession()
    this.#render()
  }

  disconnectedCallback() {
    this.#unsubscribe?.()
    this.#unsubscribe = null
    this.#unbindResize()
  }

  #bindSession() {
    this.#unsubscribe?.()
    // useSession/useProjection are React selector hooks in their original
    // form; this element re-derives on every setProps call from the owner
    // (the dock re-renders this element on every store change), so no
    // separate subscription is needed here beyond that external drive.
    this.#unsubscribe = null
  }

  #unbindResize() {
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = null
    this.#resizeRoot = null
  }

  #bindResize(root) {
    // applyDiff preserves this node's identity across renders whenever the
    // stats-root structure itself is unchanged (only its text content
    // changes) -- re-disconnecting and re-observing the SAME element on
    // every #render() call churns a fresh ResizeObserver needlessly, and
    // this element re-renders on every session/store change (its own doc
    // comment above), not only when its size could plausibly have changed.
    if (this.#resizeObserver !== null && this.#resizeRoot === root) return
    this.#unbindResize()
    this.#resizeRoot = root
    const measure = () => {
      const next = root.scrollWidth > root.clientWidth
      if (next === this.#truncated) return
      this.#truncated = next
      this.#render()
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    this.#resizeObserver = new ResizeObserver(measure)
    this.#resizeObserver.observe(root)
  }

  #render() {
    const { useSession, useProjection, t } = this.#props
    const settledNodes = useSession(s => s.chat.legacy.nodes)
    const usage = useProjection('tokenUsage')
    // Every figure rides the durable sessionStats projection, so paging and
    // compaction cannot change any of them; an assembly without the unit falls
    // back to the window-scoped fold wholesale (same field names), paid only
    // while no projection value is served.
    const projected = useProjection('sessionStats')
    const stats = projected ?? deriveStats(settledNodes)
    // Pipe-separated groups (figma stats strip); a group with no data drops out whole.
    const groups = []
    if (stats.steps > 0) {
      groups.push(t('stats.counts', { turns: stats.turns, steps: stats.steps }))
      const durations = []
      if (stats.llmMs > 0) durations.push(t('stats.llm', { duration: formatDuration(stats.llmMs) }))
      if (stats.toolMs > 0) durations.push(t('stats.toolCall', { duration: formatDuration(stats.toolMs) }))
      if (durations.length > 0) groups.push(durations.join(' · '))
      const speeds = []
      if (stats.ttftSteps > 0) {
        speeds.push(t('stats.ttftAverage', { duration: formatDuration(stats.ttftMs / stats.ttftSteps) }))
      }
      if (stats.decodeMs > 0) {
        speeds.push(t('stats.tokensPerSecond', {
          throughput: formatTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1_000)),
        }))
      }
      if (speeds.length > 0) groups.push(speeds.join(' · '))
    }
    // Context occupancy deliberately lives on the composer's ContextMeter ring,
    // not here — one home per fact.
    // Billing rides the durable projection, so these survive paging and
    // compaction. Gated on actual token activity: a session whose steps all
    // settled without billing (e.g. every request failed) shows its counts
    // without a zero-token group.
    if (usage !== undefined
      && (billedInputTokens(usage) > 0 || usage.outputTokens > 0)) {
      const cacheHit = cacheHitPercent(usage)
      if (cacheHit !== null) groups.push(t('stats.cacheHit', { percent: cacheHit }))
      groups.push(t('stats.tokens', {
        input: formatTokens(billedInputTokens(usage)),
        output: formatTokens(usage.outputTokens),
      }))
    }
    const line = groups.join(' | ')

    if (groups.length === 0) {
      applyDiff(this, [])
      this.#unbindResize()
      return
    }

    // The row elides with ellipsis when overlong; a delayed hover tooltip carries
    // the full line, enabled only while content is actually clipped.
    // h(Tooltip, {...}) calls Tooltip(props) synchronously (webjsx's
    // function-component branch), Tooltip.js's bare one-shot factory --
    // document.createElement('freddie-tooltip') fresh every call. This element
    // re-renders on every session/store change (this file's own doc comment
    // above #bindResize), so a bare h(Tooltip, ...) call recreated the
    // freddie-tooltip element (dropping its in-flight #showTimer hover-delay) on
    // every #render(). renderTooltip(cached, props) reuses the same element.
    this.#tooltipEl = renderTooltip(this.#tooltipEl, {
      label: line, side: 'top', delayMs: 500, disabled: !this.#truncated,
      children: [
        h('div', { 'data-stats-root': '', class: css.root ?? '' },
          groups.map((group, i) => [
            i > 0 && [h('span', { class: css.sep ?? '', 'aria-hidden': true }, '|'), ' '],
            h('span', null, group),
          ]),
        ),
      ],
    })
    applyDiff(this, this.#tooltipEl)
    const root = this.querySelector('[data-stats-root]')
    if (root !== null) this.#bindResize(root)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-stats-line') === undefined) {
  customElements.define('freddie-stats-line', FreddieStatsLine)
}

/**
 * Create (if needed) or update a StatsLine element in place.
 * @param el - an existing `freddie-stats-line` element to update, or null to create one.
 * @param props - see {@link StatsLineProps}.
 * @returns the `freddie-stats-line` element; keep it and pass it back in to update.
 */
export function renderStatsLine(el, props) {
  const target = el ?? document.createElement('freddie-stats-line')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function StatsLine(props) {
  return renderStatsLine(null, props)
}
