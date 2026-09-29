import {
  SessionQueryError,
  materializeSessionEventResultFilters,
  materializeSessionResultFilters,
} from '@freddie/freddie-session-query'

export const FTS_HIGHLIGHT_START = '﷐'
export const FTS_HIGHLIGHT_END = '﷑'

export const SQLITE_MAX_PAGE_LIMIT = Number.MAX_SAFE_INTEGER - 1

export const SQLITE_PORTABLE_VARIABLE_LIMIT = 32_766

export const SQLITE_FTS5_OUTER_PREDICATE_LIMIT = 14

export function assertPortableBindingCount(count) {
  if (count > SQLITE_PORTABLE_VARIABLE_LIMIT) {
    throw new SessionQueryError(
      `session-search request exceeds SQLite's portable ${SQLITE_PORTABLE_VARIABLE_LIMIT}-variable limit; reduce filter values`,
      'SESSION_QUERY_INVALID_FILTER',
    )
  }
}

export function assertFts5OuterPredicateCount(count) {
  if (count > SQLITE_FTS5_OUTER_PREDICATE_LIMIT) {
    throw new SessionQueryError(
      `session-search request exceeds the supported SQLite FTS5 outer-predicate budget of ${SQLITE_FTS5_OUTER_PREDICATE_LIMIT}; reduce filters`,
      'SESSION_QUERY_INVALID_FILTER',
    )
  }
}

export function normalizeSessionRequest(request, limits) {
  const sessionFilters = materializeSessionResultFilters(request.sessionFilters ?? [])
  const eventFilters = materializeMetadataFilters(request.eventFilters ?? [])
  const cursor = materializeCursor(request.cursor)
  return {
    query: normalizeQuery(request.query),
    sessionFilters,
    eventFilters,
    limit: normalizeLimit(request.limit, limits),
    ...cursor === undefined ? {} : { cursor },
  }
}

export function normalizeEventRequest(request, limits) {
  if (typeof request.sessionId !== 'string') {
    throw new SessionQueryError('session-search session id must be text', 'SESSION_QUERY_INVALID_FILTER')
  }
  const filters = materializeMetadataFilters(request.filters ?? [])
  const cursor = materializeCursor(request.cursor)
  return {
    sessionId: request.sessionId,
    query: normalizeQuery(request.query),
    filters,
    limit: normalizeLimit(request.limit, limits),
    ...cursor === undefined ? {} : { cursor },
  }
}

export function buildSessionWhere(filters) {
  const clauses = []
  const params = []
  for (const filter of filters) {
    switch (filter.kind) {
      case 'id':
        addList(clauses, params, 'session_id', filter.values)
        break
      case 'cwd':
        addNullableList(clauses, params, 'cwd', filter.values)
        break
      case 'created-at':
        addRange(clauses, params, 'created_at', filter)
        break
      case 'parent':
        addNullableList(clauses, params, 'parent_session', filter.values)
        break
      case 'availability': {
        const availability = [...new Set(filter.values)]
        if (availability.length === 0) clauses.push('0')
        else if (availability.length === 1) {
          const value = availability[0]
          switch (value) {
            case 'live':
              clauses.push('live = 1')
              break
            case 'persisted':
              clauses.push('persisted = 1')
              break
            default:
              unknownAvailability(value)
          }
        }
        break
      }
      default:
        unknownFilter(filter)
    }
  }
  assertFts5OuterPredicateCount(clauses.length)
  return { sql: clauses.join(' AND '), params, predicateCount: clauses.length }
}

export function buildEventWhere(filters) {
  const clauses = []
  const params = []
  for (const filter of filters) {
    switch (filter.kind) {
      case 'seq':
        addRange(clauses, params, 'seq', filter)
        break
      case 'time':
        addRange(clauses, params, 'time', filter)
        break
      case 'type':
        addList(clauses, params, 'type', filter.values)
        break
      case 'surface':
        addList(clauses, params, 'surface', filter.values)
        break
      default:
        unknownFilter(filter)
    }
  }
  assertFts5OuterPredicateCount(clauses.length)
  return { sql: clauses.join(' AND '), params, predicateCount: clauses.length }
}

export function quoteFtsData(query) {
  return `"${query.replaceAll('"', '""')}"`
}

export function sanitizeFtsText(text) {
  return text
    .replaceAll('\0', '�')
    .replaceAll(FTS_HIGHLIGHT_START, '�')
    .replaceAll(FTS_HIGHLIGHT_END, '�')
}

export function requestFingerprint(request) {
  if ('sessionId' in request) {
    return JSON.stringify({
      scope: 'events',
      sessionId: request.sessionId,
      query: request.query,
      filters: canonicalFilters(request.filters),
      limit: request.limit,
    })
  }
  return JSON.stringify({
    scope: 'sessions',
    query: request.query,
    sessionFilters: canonicalFilters(request.sessionFilters),
    eventFilters: canonicalFilters(request.eventFilters),
    limit: request.limit,
  })
}

export function makeSnippet(markedText, maxChars) {
  const { text: clean, matchStart } = normalizeMarkedText(markedText)
  const characters = Array.from(clean)
  if (characters.length <= maxChars) return clean
  if (maxChars === 1) return '…'
  const matchedIndex = Math.min(matchStart, characters.length - 1)
  let start = Math.max(0, matchedIndex - Math.floor(maxChars / 3))
  const prefix = start > 0 ? '…' : ''
  let suffix = '…'
  let contentLength = maxChars - prefix.length - suffix.length
  if (contentLength < 1) {
    start = matchedIndex
    suffix = ''
    contentLength = maxChars - prefix.length - suffix.length
  } else if (matchedIndex >= start + contentLength) {
    start = matchedIndex - contentLength + 1
  }
  let end = Math.min(characters.length, start + contentLength)
  if (end === characters.length) {
    suffix = ''
    contentLength = maxChars - prefix.length
    start = Math.max(0, end - contentLength)
  }
  end = Math.min(characters.length, start + contentLength)
  return `${prefix}${characters.slice(start, end).join('')}${suffix}`
}

function normalizeMarkedText(markedText) {
  const characters = []
  let matchStart
  for (const character of markedText) {
    if (character === FTS_HIGHLIGHT_START) {
      matchStart ??= characters.length
      continue
    }
    if (character === FTS_HIGHLIGHT_END) continue
    if (/\s/u.test(character)) {
      if (characters.length > 0 && characters.at(-1) !== ' ') characters.push(' ')
    } else {
      characters.push(character)
    }
  }
  if (characters.at(-1) === ' ') characters.pop()
  return {
    text: characters.join(''),
    matchStart: matchStart ?? 0,
  }
}

function normalizeQuery(value) {
  if (typeof value !== 'string') {
    throw new SessionQueryError('session-search query must be text', 'SESSION_QUERY_INVALID_QUERY')
  }
  const query = value.trim().replace(/\s+/gu, ' ')
  if (query.length === 0) {
    throw new SessionQueryError(
      'session-search query must contain non-whitespace text',
      'SESSION_QUERY_INVALID_QUERY',
    )
  }
  if (query.includes('\0')) {
    throw new SessionQueryError(
      'session-search query must not contain NUL',
      'SESSION_QUERY_INVALID_QUERY',
    )
  }
  return sanitizeFtsText(query)
}

function materializeCursor(cursor) {
  if (cursor === undefined) return undefined
  if (typeof cursor !== 'string') {
    throw new SessionQueryError('session-search cursor must be text', 'SESSION_QUERY_INVALID_CURSOR')
  }
  return cursor
}

function materializeMetadataFilters(filters) {
  const candidates = filters
  for (const filter of candidates) {
    switch (filter.kind) {
      case 'seq':
      case 'time':
      case 'type':
      case 'surface':
        break
      case 'text':
        throw new SessionQueryError(
          'session-search metadata filters do not accept text clauses',
          'SESSION_QUERY_INVALID_FILTER',
        )
      default:
        unknownFilter(filter)
    }
  }
  return materializeSessionEventResultFilters(filters)
}

function normalizeLimit(value, limits) {
  const limit = value ?? limits.defaultLimit
  const maxLimit = Math.min(limits.maxLimit, SQLITE_MAX_PAGE_LIMIT)
  if (
    !Number.isSafeInteger(limit)
    || limit < 1
    || limit > maxLimit
  ) {
    throw new SessionQueryError(
      `session-search limit must be an integer between 1 and ${maxLimit}`,
      'SESSION_QUERY_INVALID_LIMIT',
    )
  }
  return limit
}

function addList(clauses, params, column, values) {
  if (values.length === 0) {
    clauses.push('0')
    return
  }
  clauses.push(`${column} IN (${appendListBindings(params, values)})`)
}

function addNullableList(clauses, params, column, values) {
  if (values.length === 0) {
    clauses.push('0')
    return
  }
  const concrete = values.filter(value => value !== null)
  const parts = []
  if (concrete.length > 0) {
    parts.push(`${column} IN (${appendListBindings(params, concrete)})`)
  }
  if (values.includes(null)) parts.push(`${column} IS NULL`)
  clauses.push(`(${parts.join(' OR ')})`)
}

function addRange(clauses, params, column, range) {
  if (range.from !== undefined) {
    assertPortableBindingCount(params.length + 1)
    clauses.push(`CAST(${column} AS INTEGER) >= ?`)
    params.push(range.from)
  }
  if (range.to !== undefined) {
    assertPortableBindingCount(params.length + 1)
    clauses.push(`CAST(${column} AS INTEGER) <= ?`)
    params.push(range.to)
  }
}

function appendListBindings(params, values) {
  assertPortableBindingCount(params.length + values.length)
  for (const value of values) params.push(value)
  return values.map(() => '?').join(', ')
}

function canonicalFilters(filters) {
  return filters.map((filter) => {
    if ('values' in filter) {
      return { ...filter, values: [...filter.values].sort(compareNullable) }
    }
    return {
      kind: filter.kind,
      from: filter.from ?? null,
      to: filter.to ?? null,
    }
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

function compareNullable(a, b) {
  if (a === b) return 0
  if (a === null) return -1
  if (b === null) return 1
  return a.localeCompare(b)
}

function unknownAvailability(value) {
  throw new SessionQueryError(
    `session availability filter contains unknown value "${String(value)}"`,
    'SESSION_QUERY_INVALID_FILTER',
  )
}

function unknownFilter(filter) {
  const kind = filter.kind
  throw new SessionQueryError(
    `session filter contains unknown kind ${typeof kind === 'string' ? `"${kind}"` : '(missing)'}`,
    'SESSION_QUERY_INVALID_FILTER',
  )
}
