import { createElement as h } from '@freddie/webjsx'
import css from './ContextBody.css.js'

const MAX_CHARS = 20_000

const MAX_ENTRIES = 200

function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : null
}

function contentRuns(content) {
  const runs = []
  for (const block of content) {
    if (block.type !== 'text') {
      runs.push({ block })
      continue
    }
    const last = runs[runs.length - 1]
    if (last !== undefined && 'text' in last) last.text += block.text
    else runs.push({ text: block.text })
  }
  return runs
}

function unknownBlocks(content) {
  return contentRuns(content).flatMap(run => 'block' in run ? [run.block] : [])
}

function boundedText(text, t) {
  return text.length > MAX_CHARS
    ? `${text.slice(0, MAX_CHARS)}\n${t('json.truncated', { total: text.length })}`
    : text
}

function fieldValue(value, t) {
  const text = typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value)
  return boundedText(text, t)
}

function SourceFields({ source, formRendered, t }) {
  const record = asRecord(source)
  if (record === null) return null
  const hidden = formRendered ? ['kind', 'form'] : ['kind']
  const rows = Object.entries(record).filter(([key]) => !hidden.includes(key))
  if (rows.length === 0) return null
  return (
    h('dl', { class: css.fields ?? '', 'data-context-fields': '' },
      rows.map(([key, value]) => (
        h('div', { key, class: css.field ?? '' },
          h('dt', { class: css.fieldKey ?? '' }, key),
          h('dd', { class: css.fieldValue ?? '' }, fieldValue(value, t)),
        )
      )),
    )
  )
}

function UnknownBlocks({ blocks, t, jsonBlock }) {
  return blocks.map((block, index) => (
    jsonBlock(`unknown-${index}`, {
      label: t('message.unknownBlock'),
      payload: block,
      truncatedLabel: total => t('json.truncated', { total }),
    })
  ))
}

function ModelFacingContent({ content, t, jsonBlock }) {
  return contentRuns(content).flatMap((run, index) => ('text' in run
    ? run.text !== ''
      ? [h('pre', { key: index, class: css.text ?? '', 'data-context-text': '' }, boundedText(run.text, t))]
      : []
    : [
      jsonBlock(`run-${index}`, {
        label: t('message.unknownBlock'),
        payload: run.block,
        truncatedLabel: total => t('json.truncated', { total }),
      }),
    ]))
}

export function OpaqueBody({ content, source, t, jsonBlock }) {
  const fields = SourceFields({ source, formRendered: false, t })
  return fields === null
    ? ModelFacingContent({ content, t, jsonBlock })
    : [...ModelFacingContent({ content, t, jsonBlock }), fields]
}

function instructionChanges(source) {
  const record = asRecord(source)
  const list = record === null ? undefined : record['changes']
  if (!Array.isArray(list)) return null
  const changes = []
  const seen = new Set()
  for (const entry of list) {
    const change = asRecord(entry)
    if (change === null) return null
    const path = change['path']
    if (typeof path !== 'string' || path === '') return null
    const action = change['action']
    if (action !== 'set' && action !== 'replace' && action !== 'remove') return null
    const digest = change['digest']
    if (seen.has(path)) continue
    seen.add(path)
    changes.push({ action, path, ...typeof digest === 'string' ? { digest } : {} })
  }
  return changes.length === 0 ? null : changes
}

function instructionAction(action, baseline) {
  if (action === 'remove') return 'message.context.instructions.removed'
  if (baseline) return 'message.context.instructions.loaded'
  return action === 'set' ? 'message.context.instructions.added' : 'message.context.instructions.updated'
}

export function InstructionsBody({ content, source, t, jsonBlock }) {
  const changes = instructionChanges(source)
  if (changes === null) return OpaqueBody({ content, source, t, jsonBlock })
  const baseline = asRecord(source)?.['baseline'] === true
  return [
    h('ul', { class: css.files ?? '', 'data-context-files': '' },
      changes.map(change => (
        h('li', { key: change.path, class: css.file ?? '', title: change.digest },
          h('span', { class: css.filePath ?? '' }, change.path),
          h('span', { class: css.fileAction ?? '' },
            t(instructionAction(change.action, baseline)),
          ),
        )
      )),
    ),
    ...ModelFacingContent({ content, t, jsonBlock }),
  ]
}

function catalogEntries(source) {
  const record = asRecord(source)
  const list = record === null ? undefined : record['entries']
  if (!Array.isArray(list)) return null
  const entries = []
  for (const item of list) {
    const entry = asRecord(item)
    if (entry === null) return null
    const name = entry['name']
    const description = entry['description']
    if (typeof name !== 'string' || name === '' || typeof description !== 'string') return null
    entries.push({ name, description })
  }
  return entries
}

export function CatalogBody({ content, source, t, jsonBlock }) {
  const entries = catalogEntries(source)
  if (entries === null) return OpaqueBody({ content, source, t, jsonBlock })
  const update = asRecord(source)?.['update'] === true
  const shown = entries.slice(0, MAX_ENTRIES)
  const rest = unknownBlocks(content)
  return [
    ...(update ? [h('p', { class: css.catalogNotice ?? '', 'data-context-catalog-update': '' }, t('message.context.catalog.replaced'))] : []),
    h('ul', { class: css.entries ?? '', 'data-context-entries': '' },
      shown.map((entry, index) => (
        h('li', { key: index, class: css.entry ?? '' },
          h('code', { class: css.entryName ?? '' }, entry.name),
          h('span', { class: css.entryDescription ?? '' }, entry.description),
        )
      )),
    ),
    ...(shown.length < entries.length
      ? [
        h('p', { class: css.catalogNotice ?? '', 'data-context-entries-truncated': '' },
          t('message.context.catalog.more', { count: entries.length - shown.length }),
        ),
      ]
      : []),
    ...UnknownBlocks({ blocks: rest, t, jsonBlock }),
  ]
}

function snapshotSections(source) {
  const record = asRecord(source)
  const list = record === null ? undefined : record['sections']
  if (!Array.isArray(list)) return null
  const sections = []
  for (const item of list) {
    const section = asRecord(item)
    if (section === null) return null
    const name = section['name']
    const text = section['text']
    if (typeof name !== 'string' || name === '' || typeof text !== 'string') return null
    sections.push({ name, text })
  }
  return sections.length === 0 ? null : sections
}

export function SnapshotBody({ content, source, t, jsonBlock }) {
  const sections = snapshotSections(source)
  /* v8 ignore next */
  if (sections === null) return OpaqueBody({ content, source, t, jsonBlock })
  return [
    h('p', { class: css.catalogNotice ?? '', 'data-context-snapshot-supersedes': '' },
      t('message.context.snapshot.supersedes'),
    ),
    h('dl', { class: css.sections ?? '', 'data-context-sections': '' },
      sections.map((section, index) => (
        h('div', { key: index, class: css.section ?? '' },
          h('dt', { class: css.sectionName ?? '' }, section.name),
          h('dd', { class: css.sectionText ?? '' }, boundedText(section.text, t)),
        )
      )),
    ),
  ]
}

export function NoticeBody({ content, t, jsonBlock }) {
  return ModelFacingContent({ content, t, jsonBlock })
}

export function RelayBody({ content, source, t, jsonBlock }) {
  const sender = relaySender(source)
  /* v8 ignore next */
  if (sender === null) return OpaqueBody({ content, source, t, jsonBlock })
  return [
    h('p', { class: css.relaySender ?? '', 'data-context-relay-sender': '' },
      t('message.context.relay.from', { session: sender }),
    ),
    ...ModelFacingContent({ content, t, jsonBlock }),
  ]
}

function relaySender(source) {
  const sender = asRecord(source)?.['senderSessionId']
  return typeof sender === 'string' && sender !== '' ? sender : null
}

function recalledSessions(source) {
  const record = asRecord(source)
  const list = record === null ? undefined : record['references']
  if (!Array.isArray(list)) return null
  const sessions = []
  for (const item of list) {
    const reference = asRecord(item)
    if (reference === null) return null
    const label = reference['label']
    const retained = reference['retainedMessages']
    const omitted = reference['omittedMessages']
    const truncated = reference['truncated']
    if (typeof label !== 'string' || label === ''
      || typeof retained !== 'number' || typeof omitted !== 'number'
      || typeof truncated !== 'boolean') return null
    sessions.push({ label, retained, omitted, truncated })
  }
  return sessions.length === 0 ? null : sessions
}

export function RecallBody({ content, source, t, jsonBlock }) {
  const sessions = recalledSessions(source)
  if (sessions === null) return OpaqueBody({ content, source, t, jsonBlock })
  return [
    h('ul', { class: css.recalls ?? '', 'data-context-recalls': '' },
      sessions.map((session, index) => (
        h('li', { key: index, class: css.recall ?? '' },
          h('span', { class: css.recallLabel ?? '' }, session.label),
          h('span', { class: css.recallCounts ?? '' },
            t('message.context.recall.counts', {
              retained: session.retained,
              omitted: session.omitted,
            }),
          ),
          session.truncated && (
            h('span', { class: css.recallCounts ?? '' }, t('message.context.recall.truncated'))
          ),
        )
      )),
    ),
    ...ModelFacingContent({ content, t, jsonBlock }),
  ]
}

function noticeSummary(source) {
  const summary = asRecord(source)?.['summary']
  return typeof summary === 'string' && summary !== '' ? summary : null
}

export function contextBody(form, props) {
  const opaque = { rendered: null, summary: null, body: OpaqueBody(props) }
  switch (form) {
    case 'instructions':
      return instructionChanges(props.source) === null
        ? opaque
        : { rendered: 'instructions', summary: null, body: InstructionsBody(props) }
    case 'catalog':
      return catalogEntries(props.source) === null
        ? opaque
        : { rendered: 'catalog', summary: null, body: CatalogBody(props) }
    case 'snapshot':
      return snapshotSections(props.source) === null
        ? opaque
        : { rendered: 'snapshot', summary: null, body: SnapshotBody(props) }
    case 'notice': {
      const summary = noticeSummary(props.source)
      return summary === null
        ? opaque
        : { rendered: 'notice', summary, body: NoticeBody(props) }
    }
    case 'relay':
      return relaySender(props.source) === null
        ? opaque
        : { rendered: 'relay', summary: null, body: RelayBody(props) }
    case 'recall':
      return recalledSessions(props.source) === null
        ? opaque
        : { rendered: 'recall', summary: null, body: RecallBody(props) }
    case null:
      return opaque
    /* v8 ignore next 4 */
    default: {
      const unreachable = form
      throw new Error(`unreachable context form: ${String(unreachable)}`)
    }
  }
}
