import { createElement as h } from '@freddie/webjsx'
import { JsonTree } from '@freddie/freddie-client-ui-primitives'
import css from './TrajectoryTable.css.js'

export function TokenRows({ cell }) {
  const content = cell.output !== undefined && cell.think !== undefined
    ? Math.max(0, cell.output - cell.think)
    : undefined
  return [
    h('div', null,
      h('dt', null, 'Tokens'),
      h('dd', null, cell.output === undefined ? '—' : `${cell.output} tok`),
    ),
    cell.think !== undefined
      ? (
        h('div', {class: css.requestTokenDetail ?? ''},
          h('dt', null, 'Reasoning'),
          h('dd', null, cell.think, ' tok'),
        )
      )
      : null,
    content !== undefined
      ? (
        h('div', {class: css.requestTokenDetail ?? ''},
          h('dt', null, 'Content'),
          h('dd', null, content, ' tok'),
        )
      )
      : null,
  ]
}

function inputTotal(usage) {
  if (
    usage.input === undefined
    && usage.cacheRead === undefined
    && usage.cacheWrite === undefined
  ) return undefined
  return (usage.input ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0)
}

export function UsageRows({ usage }) {
  if (usage === undefined) return h('p', {class: css.noPayload ?? ''}, 'Usage not reported')
  const totalInput = inputTotal(usage)
  const otherOutput = usage.output !== undefined && usage.reasoning !== undefined
    ? usage.output - usage.reasoning
    : undefined
  return (
    h('dl', {class: css.overview ?? ''},
      totalInput !== undefined && (
        h('div', null, h('dt', null, 'Input'), h('dd', null, totalInput, ' tok'))
      ),
      usage.cacheRead !== undefined && (
        h('div', {class: css.requestTokenDetail ?? ''},
          h('dt', null, 'Cached'),
          h('dd', null, usage.cacheRead, ' tok'),
        )
      ),
      usage.cacheWrite !== undefined && (
        h('div', {class: css.requestTokenDetail ?? ''},
          h('dt', null, 'Cache created'),
          h('dd', null, usage.cacheWrite, ' tok'),
        )
      ),
      usage.input !== undefined && (
        h('div', {class: css.requestTokenDetail ?? ''},
          h('dt', null, 'Other'),
          h('dd', null, usage.input, ' tok'),
        )
      ),
      usage.output !== undefined && (
        h('div', null, h('dt', null, 'Output'), h('dd', null, usage.output, ' tok'))
      ),
      usage.reasoning !== undefined && (
        h('div', {class: css.requestTokenDetail ?? ''},
          h('dt', null, 'Reasoning'),
          h('dd', null, usage.reasoning, ' tok'),
        )
      ),
      otherOutput !== undefined && (
        h('div', {class: css.requestTokenDetail ?? ''},
          h('dt', null, 'Content'),
          h('dd', null, otherOutput, ' tok'),
        )
      ),
    )
  )
}

export function RequestUsagePanel({
  usage,
  cumulative,
}) {
  return (
    h('div', {class: css.usagePanel ?? ''},
      h('section', {class: css.usageGroup ?? ''},
        h('h4', {class: css.usageHeading ?? ''}, 'This request'),
        h(UsageRows, {usage: usage}),
      ),
      h('section', {class: css.usageGroup ?? ''},
        h('h4', {class: css.usageHeading ?? ''}, 'Session cumulative'),
        h(UsageRows, {usage: cumulative}),
      ),
    )
  )
}

export function RequestOptions({
  options,
  preview = false,
}) {
  if (options === undefined) {
    return h('p', {class: css.noPayload ?? ''}, 'Options not recorded')
  }
  return (
    h(JsonTree, {
      data: options,
      label: 'Request options JSON',
      className: preview ? css.jsonPreview : css.jsonPayload,
    })
  )
}
