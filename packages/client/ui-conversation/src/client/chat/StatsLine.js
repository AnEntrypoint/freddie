import { applyDiff, createElement as h } from '@freddie/webjsx'
import { defineElement } from '@freddie/freddie-client-ui-primitives'
import { formatTokensPerSecond } from './message-chrome.js'
import { assistantStepReading } from './turn-metrics.js'
import css from './StatsLine.css.js'

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

export function formatTokens(n) {
  const scaled = (v) =>
    v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${scaled(n / 1_000)}K`
  return `${scaled(n / 1_000_000)}M`
}

export function formatDuration(ms) {
  const s = ms / 1_000
  if (s < 60) return `${Math.round(s * 10) / 10}s`
  const whole = Math.round(s)
  return `${Math.floor(whole / 60)}m${whole % 60}s`
}

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

export function cacheHitPercent(usage) {
  const denominator = billedInputTokens(usage)
  if (denominator === 0) return null
  const missedInputTokens = usage.uncachedInputTokens + usage.cacheWriteTokens
  if (missedInputTokens === 0) return '100'

  const integerPercent = roundedIntegerPercent(usage.cacheReadTokens, denominator)
  if (integerPercent < 100) return String(integerPercent)

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

export function billedInputTokens(usage) {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

export function contextOccupancy(pressure) {
  const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens
  if (usedTokens === undefined || pressure?.contextWindow === undefined) return null
  return {
    percent: Math.min(100, Math.round(usedTokens / pressure.contextWindow * 100)),
    usedTokens,
    contextWindow: pressure.contextWindow,
  }
}

const DEFAULT_PROPS = {
  useSession: (() => { throw new Error('StatsLine: useSession not wired') }),
  useProjection: (() => undefined),
  t: (key) => key,
}

export class FreddieStatsLine extends HTMLElement {
  #props = DEFAULT_PROPS
  #unsubscribe = null

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
  }

  #bindSession() {
    this.#unsubscribe?.()
    this.#unsubscribe = null
  }

  #render() {
    const { useSession, useProjection, t } = this.#props
    const settledNodes = useSession(s => s.chat.legacy.nodes)
    const usage = useProjection('tokenUsage')
    const projected = useProjection('sessionStats')
    const stats = projected ?? deriveStats(settledNodes)
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
    if (usage !== undefined
      && (billedInputTokens(usage) > 0 || usage.outputTokens > 0)) {
      const cacheHit = cacheHitPercent(usage)
      if (cacheHit !== null) groups.push(t('stats.cacheHit', { percent: cacheHit }))
      groups.push(t('stats.tokens', {
        input: formatTokens(billedInputTokens(usage)),
        output: formatTokens(usage.outputTokens),
      }))
    }
    applyDiff(this, groups.length === 0 ? [] : [
      h('div', { 'data-stats-root': '', class: css.root ?? '' },
        groups.map((group, index) => h('span', { key: index }, group)),
      ),
    ])
  }
}

defineElement('freddie-stats-line', FreddieStatsLine)

export function renderStatsLine(el, props) {
  const target = el ?? document.createElement('freddie-stats-line')
  target.setProps(props)
  return target
}

export function StatsLine(props) {
  return renderStatsLine(null, props)
}
