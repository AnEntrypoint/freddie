import { stat } from 'node:fs/promises'
import { resolveSessionPreset } from '@freddie/freddie-agent-presets'
import { SessionQueryError } from '@freddie/freddie-session-query'
import { TypertLookupFailure } from '@freddie/freddie-typert-protocol'
import {
  SESSION_SEARCH_RESULT_LIMIT,
  SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS,
} from './types.js'

const SEARCH_PROVIDER_CALL_LIMIT = 100
const SESSION_SEARCH_QUERY_MAX_CHARS = 500
const MESSAGE_TYPES = new Set(['user/message', 'assistant/message'])
const COLD_SUMMARY_BATCH_SIZE = 16
const DEFAULT_COLD_PROBE_MAX_BYTES = 1024

export function truncateUnicodeCodePoints(value, maximum) {
  let count = 0
  let end = 0
  for (const codePoint of value) {
    if (count === maximum) return value.slice(0, end)
    count++
    end += codePoint.length
  }
  return value
}

export class ApiSessionList {
  constructor(ctx) {
    this.ctx = ctx
  }

  summaryFor(session) {
    const projections = this.projectionsFor(session.header, session)
    const metadata = projections?.values.sessionListMetadata
    const running = this.ctx.agents.get(session.id)?.status === 'running'
    return {
      sessionId: session.id,
      updatedAt: updatedAt(session.header, metadata),
      agentAvailable: this.ctx.agents.get(session.id)?.session === session,
      running,
      blank: metadata?.blank ?? session.seq === 0,
      errored: !running && metadata?.errored === true,
      ...listFields(session.header, session.events),
      ...(projections === undefined ? {} : { projections }),
    }
  }

  erroredFor(session, running) {
    return !running && this.projectionsFor(session.header, session)?.values.sessionListMetadata?.errored === true
  }

  async list(signal) {
    signal?.throwIfAborted()
    const records = await this.ctx.sessionQuery.listSessions(signal)
    signal?.throwIfAborted()
    const items = []
    const cold = []
    for (const record of records) {
      const live = this.ctx.sessions.get(record.header.id)
      if (live !== undefined) {
        items.push(this.summaryFor(live))
        continue
      }
      if (record.header.cwd === undefined) continue
      cold.push(record.header)
    }
    for (let offset = 0; offset < cold.length; offset += COLD_SUMMARY_BATCH_SIZE) {
      signal?.throwIfAborted()
      const batch = cold.slice(offset, offset + COLD_SUMMARY_BATCH_SIZE)
      items.push(...await Promise.all(batch.map(header => this.summarizeCold(header, signal))))
    }
    signal?.throwIfAborted()
    items.push(...await this.listForeignRows(new Set(items.map(item => item.sessionId)), signal))
    items.sort((left, right) => right.updatedAt - left.updatedAt)
    return items
  }

  async listForeignRows(seen, signal) {
    const persistence = this.ctx.get('sessionPersistence')
    if (typeof persistence?.listForeign !== 'function') return []
    const rows = []
    for (const extraHome of persistence.extraRoots ?? []) {
      signal?.throwIfAborted()
      let headers
      try {
        headers = await persistence.listForeign(extraHome, signal)
      } catch (error) {
        signal?.throwIfAborted()
        this.ctx.logger.warn(
          `api-session.list: skipping extra session root ${JSON.stringify(extraHome)}: ${String(error.message ?? error)}`,
        )
        continue
      }
      for (const header of headers) {
        if (header.cwd === undefined || seen.has(header.id)) continue
        seen.add(header.id)
        rows.push({
          sessionId: header.id,
          updatedAt: updatedAt(header, undefined),
          agentAvailable: false,
          running: false,
          blank: false,
          errored: false,
          readOnly: true,
          extraHome,
          ...listFields(header),
        })
      }
    }
    return rows
  }

  async summarizeCold(header, signal) {
    const projections = this.projectionsFor(header, undefined)
    const cached = projections?.values.sessionListMetadata
    const probed = cached?.blank === false ? undefined : await this.probeColdMetadata(header, signal)
    return {
      sessionId: header.id,
      updatedAt: updatedAt(header, probed ?? cached),
      agentAvailable: false,
      running: false,
      blank: cached?.blank === false ? false : probed?.blank ?? false,
      errored: (cached?.errored ?? probed?.errored) === true,
      ...listFields(header),
      ...(projections === undefined ? {} : { projections }),
    }
  }

  async probeColdMetadata(header, signal) {
    const maxBytes = this.ctx.get('apiProxy')?.coldBlankProbeMaxBytes ?? DEFAULT_COLD_PROBE_MAX_BYTES
    const persistence = this.ctx.get('sessionPersistence')
    const registry = this.ctx.get('sessionProjections')
    if (maxBytes === 0 || registry === undefined || typeof persistence?.locate !== 'function') return undefined
    signal?.throwIfAborted()
    const location = persistence.locate(header)
    if (location === undefined) return undefined
    try {
      if ((await stat(location.path)).size > maxBytes) return undefined
      const { events } = await persistence.readFrom(header.id, 0, signal)
      signal?.throwIfAborted()
      return registry.restore({}, events, 0).snapshot.values.sessionListMetadata
    } catch (error) {
      signal?.throwIfAborted()
      if (error?.code !== 'ENOENT') {
        this.ctx.logger.warn(
          `api-session.list: blank probe for "${header.id}" failed; serving it as visible: ${String(error)}`,
        )
      }
      return undefined
    }
  }

  async search(query, signal) {
    const normalizedQuery = normalizeSearchQuery(query)
    signal.throwIfAborted()
    const visible = await this.ctx.sessionQuery.listSessions(signal)
    signal.throwIfAborted()
    const visibleIds = new Set(visible
      .filter(record => record.header.cwd !== undefined)
      .map(record => record.header.id))
    if (visibleIds.size === 0) return { items: [], hasMore: false }
    const authorized = []
    const acceptedIds = new Set()
    const seenCursors = new Set()
    let cursor
    let providerCalls = 0
    let pageLimit = SESSION_SEARCH_RESULT_LIMIT
    while (authorized.length <= SESSION_SEARCH_RESULT_LIMIT) {
      signal.throwIfAborted()
      if (providerCalls >= SEARCH_PROVIDER_CALL_LIMIT) {
        throw new Error(`session search provider exceeded the ${SEARCH_PROVIDER_CALL_LIMIT}-call work budget`)
      }
      providerCalls++
      const requestedCursor = cursor
      const requestedLimit = pageLimit
      let page
      try {
        page = await this.ctx.sessionQuery.searchSessions({
          query: normalizedQuery,
          eventFilters: [
            { kind: 'type', values: ['user/message', 'assistant/message'] },
            { kind: 'surface', values: ['current'] },
          ],
          limit: requestedLimit,
          ...(requestedCursor === undefined ? {} : { cursor: requestedCursor }),
        }, { signal })
        signal.throwIfAborted()
      } catch (error) {
        signal.throwIfAborted()
        if (requestedCursor === undefined
          && error instanceof SessionQueryError
          && error.code === 'SESSION_QUERY_INVALID_LIMIT'
          && requestedLimit > 1) {
          pageLimit = Math.max(1, Math.floor(requestedLimit / 2))
          continue
        }
        if (requestedCursor !== undefined
          && error instanceof SessionQueryError
          && error.code === 'SESSION_QUERY_STALE_CURSOR') {
          authorized.length = 0
          acceptedIds.clear()
          seenCursors.clear()
          cursor = undefined
          continue
        }
        throw error
      }
      if (page.items.length > requestedLimit) {
        throw new Error(`session search provider returned ${String(page.items.length)} items; maximum is ${String(requestedLimit)}`)
      }
      for (const hit of page.items) {
        if (authorized.length > SESSION_SEARCH_RESULT_LIMIT) continue
        if (!visibleIds.has(hit.header.id)
          || hit.bestMatch.sessionId !== hit.header.id
          || hit.bestMatch.surface !== 'current'
          || !MESSAGE_TYPES.has(hit.bestMatch.type)
          || acceptedIds.has(hit.header.id)) continue
        acceptedIds.add(hit.header.id)
        authorized.push({
          sessionId: hit.header.id,
          snippet: truncateUnicodeCodePoints(hit.bestMatch.snippet, SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS),
        })
      }
      if (page.nextCursor !== undefined) {
        if (seenCursors.has(page.nextCursor)) {
          throw new Error('session search provider repeated a continuation cursor')
        }
        seenCursors.add(page.nextCursor)
      }
      if (authorized.length > SESSION_SEARCH_RESULT_LIMIT || page.nextCursor === undefined) break
      cursor = page.nextCursor
    }
    return {
      items: authorized.slice(0, SESSION_SEARCH_RESULT_LIMIT),
      hasMore: authorized.length > SESSION_SEARCH_RESULT_LIMIT,
    }
  }

  projectionsFor(header, session) {
    try {
      if (session !== undefined) {
        return hintsOf('sequenced', this.ctx.sessionProjections.snapshot(session))
      }
      const cache = this.ctx.get('sessionProjectionCache')
      return hintsOf('cached', cache?.cachedSnapshot(header))
    } catch (error) {
      this.ctx.logger.warn(
        `api-session.list: projection column for "${header.id}" failed; serving the row without it: ${String(error)}`,
      )
      return undefined
    }
  }
}

function hintsOf(kind, block) {
  if (block === undefined || Object.keys(block.values).length === 0) return undefined
  return { kind, asOfSeq: block.asOfSeq, values: block.values }
}

function normalizeSearchQuery(query) {
  const normalized = query.trim()
  if (normalized.length === 0) {
    throw new TypertLookupFailure({
      code: 'bad-request',
      message: 'session search query must not be empty',
      details: {},
    })
  }
  if (normalized.length > SESSION_SEARCH_QUERY_MAX_CHARS) {
    throw new TypertLookupFailure({
      code: 'bad-request',
      message: `session search query must contain at most ${SESSION_SEARCH_QUERY_MAX_CHARS} UTF-16 code units`,
      details: {},
    })
  }
  if (normalized.includes('\0')) {
    throw new TypertLookupFailure({
      code: 'bad-request',
      message: 'session search query must not contain NUL',
      details: {},
    })
  }
  return normalized
}

function updatedAt(header, metadata) {
  return Math.max(header.createdAt, metadata?.lastPromptAt ?? 0)
}

function listFields(header, events = []) {
  const agentPreset = resolveSessionPreset({ header, events })
  return {
    ...(header.parentSession === undefined ? {} : { parentSessionId: header.parentSession }),
    ...(header.origin === undefined ? {} : { origin: header.origin }),
    ...(header.cwd === undefined ? {} : { cwd: header.cwd }),
    ...(agentPreset === undefined ? {} : { agentPreset }),
  }
}
