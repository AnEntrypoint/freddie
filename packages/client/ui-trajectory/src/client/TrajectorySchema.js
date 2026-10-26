import { createElement as h } from '@freddie/webjsx'
import { JsonTree } from '@freddie/freddie-client-ui-primitives'
import css from './TrajectoryTable.css.js'

export function RecordSchema({
  record,
  preview = false,
}) {
  if (!record.cell.schemaDetail) {
    return h('p', {class: css.noPayload ?? ''}, 'Schema unavailable')
  }
  const schema = parseToolSchema(record.cell.schemaDetail)
  if (schema !== undefined) {
    return (
      h('div', {class: (preview ? `${css.schema ?? ''} ${css.schemaPreview ?? ''}` : css.schema) ?? ''},
        h('header', {class: css.schemaIntro ?? ''},
          h('h3', {class: css.schemaName ?? ''}, schema.name),
          h('p', {class: css.schemaDescription ?? ''}, schema.description),
        ),
        h('section', {class: css.schemaParameters ?? ''},
          h('h4', {class: css.schemaParametersTitle ?? ''}, 'Parameters'),
          h(JsonTree, {
            data: schema.parameters,
            label: `${schema.name} parameters JSON`,
            className: css.schemaTree,
          }),
        ),
      )
    )
  }
  return (
    h('pre', {class: `${css.payload ?? ''} ${preview ? css.payloadPreview ?? '' : ''}`},
      record.cell.schemaDetail,
    )
  )
}

function parseToolSchema(value) {
  try {
    const parsed = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const schema = parsed
    if (
      typeof schema.name !== 'string'
      || typeof schema.description !== 'string'
      || typeof schema.parameters !== 'object'
      || schema.parameters === null
      || Array.isArray(schema.parameters)
    ) return undefined
    return {
      name: schema.name,
      description: schema.description,
      parameters: schema.parameters,
    }
  } catch {
    return undefined
  }
}

export function parseJsonContainer(value) {
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined
  } catch {
    return undefined
  }
}
