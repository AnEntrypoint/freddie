function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : null
}

function readString(record, key) {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function collect(source, member, field) {
  const list = source[member]
  if (!Array.isArray(list)) return []
  const seen = []
  for (const entry of list) {
    const record = asRecord(entry)
    const value = record === null ? null : readString(record, field)
    if (value !== null && !seen.includes(value)) seen.push(value)
  }
  return seen
}

function joined(names) {
  return names.length > 0 ? names.join(', ') : null
}

export function sessionRecallLabels(source) {
  const record = asRecord(source)
  if (record === null || readString(record, 'kind') !== 'session-reference') return []
  return collect(record, 'references', 'label')
}

export function contextProvenance(source) {
  const record = asRecord(source)
  const kind = record === null ? null : readString(record, 'kind')
  if (record === null || kind === null) return { role: 'inject', label: null }
  switch (kind) {
    case 'session-reference':
      return { role: 'recall', label: joined(collect(record, 'references', 'label')) ?? kind }
    case 'memory-capture':
      return { role: 'recall', label: joined(collect(record, 'captures', 'name')) ?? kind }
    case 'agent-instructions':
      return { role: 'inject', label: joined(collect(record, 'changes', 'path')) ?? kind }
    case 'plugin':
      return { role: 'inject', label: readString(record, 'plugin') ?? kind }
    case 'skill-invocation':
      return { role: 'inject', label: readString(record, 'name') ?? kind }
    default:
      return { role: 'inject', label: kind }
  }
}

const KNOWN_FORMS = ['instructions', 'catalog', 'snapshot', 'notice', 'relay', 'recall']

export function contextForm(source) {
  const record = asRecord(source)
  const form = record === null ? null : readString(record, 'form')
  return form !== null && KNOWN_FORMS.includes(form)
    ? form
    : null
}
