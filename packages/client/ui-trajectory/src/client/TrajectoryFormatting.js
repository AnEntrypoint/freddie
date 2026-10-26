import { createElement as h } from '@freddie/webjsx'
import css from './TrajectoryTable.css.js'

export function formatDurationMs(milliseconds) {
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`
  return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 2 : 1)} s`
}

function formatStartedAt(timestamp) {
  if (timestamp === null || !Number.isFinite(timestamp)) return 'Not available'
  const date = new Date(timestamp)
  const two = (value) => String(value).padStart(2, '0')
  const three = (value) => String(value).padStart(3, '0')
  const time = `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}.${three(date.getMilliseconds())}`
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`
  return `${day} ${time}`
}

function clickSelectsText(target) {
  const selection = window.getSelection()
  return selection !== null
    && !selection.isCollapsed
    && selection.rangeCount > 0
    && selection.getRangeAt(0).intersectsNode(target)
}

export function StartedAtValue({
  timestamp,
  showUnix,
  onToggle,
}) {
  if (timestamp === null || !Number.isFinite(timestamp)) return h('dd', null, 'Not available')
  return (
    h('dd', null,
      h('button', {
        type: 'button',
        class: css.timestampToggle ?? '',
        title: showUnix ? 'Show local time' : 'Show Unix timestamp',
        onclick: (event) => {
          if (clickSelectsText(event.currentTarget)) return
          onToggle()
        },
      },
        showUnix ? (timestamp / 1_000).toFixed(3) : formatStartedAt(timestamp),
      ),
    )
  )
}

function totalTime(metrics) {
  if (!metrics.timingRecorded) return 'Not recorded'
  if (metrics.stepStartTime === null) return 'Step start unavailable'
  if (metrics.completedTime === null) return 'Pending'
  return formatDurationMs(Math.max(0, metrics.completedTime - metrics.stepStartTime))
}

function ttft(metrics) {
  if (!metrics.timingRecorded) return 'Not recorded'
  if (metrics.stepStartTime === null) return 'Step start unavailable'
  if (metrics.firstTokenTime === null) return 'First token unavailable'
  return formatDurationMs(Math.max(0, metrics.firstTokenTime - metrics.stepStartTime))
}

function generationTime(metrics) {
  if (!metrics.timingRecorded || metrics.firstTokenTime === null) return 'First token unavailable'
  if (metrics.completedTime === null) return 'Pending'
  return formatDurationMs(Math.max(0, metrics.completedTime - metrics.firstTokenTime))
}

function throughput(metrics) {
  if (!metrics.usageProvided) return 'Usage unavailable'
  if (metrics.outputTokens === null) return 'Output tokens unavailable'
  if (!metrics.timingRecorded || metrics.firstTokenTime === null) return 'First token unavailable'
  if (metrics.completedTime === null) return 'Pending'
  const generationSeconds = (metrics.completedTime - metrics.firstTokenTime) / 1_000
  if (generationSeconds <= 0) return 'Duration too short'
  return `${(metrics.outputTokens / generationSeconds).toFixed(1)} tok/s`
}

export function AssistantTimingPanel({
  metrics,
  showUnix,
  onToggleUnix,
}) {
  return (
    h('dl', {class: css.overview ?? ''},
      h('div', null, h('dt', null, 'Started'), h(StartedAtValue, {timestamp: metrics.stepStartTime, showUnix: showUnix, onToggle: onToggleUnix})),
      h('div', null, h('dt', null, 'Total duration'), h('dd', null, totalTime(metrics))),
      h('div', null, h('dt', null, 'TTFT'), h('dd', null, ttft(metrics))),
      h('div', null, h('dt', null, 'Generation'), h('dd', null, generationTime(metrics))),
      h('div', null, h('dt', null, 'Throughput'), h('dd', null, throughput(metrics))),
    )
  )
}
