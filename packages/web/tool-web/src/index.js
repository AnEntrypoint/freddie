import z from '@freddie/schemastery'
import { applyWebSearchTool, WEB_SEARCH_MAX_QUERIES, WEB_SEARCH_MAX_RESULTS } from './search.js'
import { applyWebFetchTool } from './fetch.js'

export { WEB_SEARCH_MAX_QUERIES, WEB_SEARCH_MAX_RESULTS, applyWebSearchTool, formatSearchOutput, presentSearchCall, presentSearchResult, searchMetaFromValue, searchMetaFromResult } from './search.js'
export { applyWebFetchTool, formatFetchOutput, parseFetchArgs, presentFetchCall, presentFetchResult, fetchMetaFromValue, fetchMetaFromResult } from './fetch.js'

export const name = 'tool-web'

export const inject = ['tools', 'web', 'systemPrompt']

export const DEFAULT_WEB_TOOL_TIMEOUT_MS = 30_000

export const DEFAULT_FETCH_MAX_OUTPUT_CHARS = 200_000

export const Config = z.object({
  search: z.boolean().default(true),
  fetch: z.boolean().default(true),
  searchMaxResults: z.number().default(WEB_SEARCH_MAX_RESULTS),
  searchMaxQueries: z.number().default(WEB_SEARCH_MAX_QUERIES),
  fetchTimeoutMs: z.number().default(DEFAULT_WEB_TOOL_TIMEOUT_MS),
  searchTimeoutMs: z.number().default(DEFAULT_WEB_TOOL_TIMEOUT_MS),
  fetchMaxOutputChars: z.number().default(DEFAULT_FETCH_MAX_OUTPUT_CHARS),
})

function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`tool-web: ${name} must be a positive integer`)
  }
}

export function apply(ctx, config) {
  const resolved = config
  assertPositiveInteger('searchMaxResults', resolved.searchMaxResults)
  assertPositiveInteger('searchMaxQueries', resolved.searchMaxQueries)
  assertPositiveInteger('fetchTimeoutMs', resolved.fetchTimeoutMs)
  assertPositiveInteger('searchTimeoutMs', resolved.searchTimeoutMs)
  assertPositiveInteger('fetchMaxOutputChars', resolved.fetchMaxOutputChars)
  if (resolved.search) {
    applyWebSearchTool(ctx, resolved.searchMaxResults, resolved.searchMaxQueries, resolved.searchTimeoutMs, resolved.fetch)
  }
  if (resolved.fetch) applyWebFetchTool(ctx, resolved.fetchTimeoutMs, resolved.fetchMaxOutputChars)
}
