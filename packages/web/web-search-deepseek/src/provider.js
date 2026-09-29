/**
 * DeepSeek search through an Anthropic-compatible Messages model call with the native
 * `web_search_20250305` server tool. Each search costs a model turn, but returns structured
 * result blocks; absence of those blocks is an error rather than a prose-scraping fallback.
 * The wire format and native `fetch` client are provider-private and do not use `ctx.llm`.
 *
 * @typedef {{ type: string; url: string; title?: string | null; page_age?: string | null }} WebSearchResultItem
 *   A `web_search_result` item inside a `web_search_tool_result` block. `page_age` is a
 *   provider-supplied page age/recency string, mapped to `publishedAt`.
 * @typedef {{ type: 'web_search_tool_result'; content?: WebSearchResultItem[] }} WebSearchToolResultBlock
 *   A `web_search_tool_result` content block: the citeable result shape.
 * @typedef {{ type?: string; url?: string | null; cited_text?: string | null }} CitationLocation
 *   One citation location inside a `text` block (the snippet source).
 * @typedef {{ type: 'text'; text?: string | null; citations?: CitationLocation[] }} TextBlock
 *   A `text` content block: the model's prose plus per-URL citations.
 * @typedef {WebSearchToolResultBlock | TextBlock | { type: string }} ContentBlock
 *   Any content block; only `web_search_tool_result` and `text` are consumed.
 * @typedef {{ content?: ContentBlock[] }} AnthropicResponse DeepSeek's Anthropic Messages response envelope.
 * @typedef {{ error?: { message?: string } | string; message?: string }} AnthropicError
 *   DeepSeek's error response envelope (best-effort; fields vary).
 * @typedef {{ endpoint: string; apiVersion: string; body: { model: string; max_tokens: number; messages: [{ role: 'user'; content: [{ type: 'text'; text: string }] }]; tools: [{ type: 'web_search_20250305'; name: 'web_search'; max_uses: number }] } }} DeepSeekSearchLlmRequest
 *   Exact secret-free DeepSeek Messages request recorded immediately before one auxiliary search dispatch.
 * @typedef {{ apiKey?: string; resolveApiKey?: () => Promise<string | undefined>; apiKeyEnv?: string; baseURL: string; model: string; apiVersion: string; maxTokens: number; maxUses: number; recordRequest?: (request: DeepSeekSearchLlmRequest) => void }} DeepSeekSearchProviderOptions
 *   Resolved provider options (the plugin's `apply` supplies credential and constant defaults).
 *   `apiKey`, when present, wins over `resolveApiKey`. `recordRequest` records the exact
 *   secret-free request immediately before dispatch; a throw prevents dispatch so model-visible
 *   auxiliary input cannot escape logging.
 */

import { WebError } from '@freddie/freddie-web'

export const DEEPSEEK_PROVIDER_ID = 'deepseek-official'

export const DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com/anthropic/v1'

export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-flash'

export const DEEPSEEK_DEFAULT_API_VERSION = '2023-06-01'

export const DEEPSEEK_DEFAULT_MAX_TOKENS = 4096

export const DEEPSEEK_DEFAULT_MAX_USES = 5

const USER_AGENT = 'freddie/0.0.1'

/**
 * Build a `url → cited_text` map from every `text` block's `citations[]`. This
 * is the snippet source: Anthropic `web_search_result` items carry
 * `url`/`title`/`page_age` but typically NO inline snippet — the excerpt lives
 * in a separate `text` block's citation, keyed by `url` (first occurrence wins).
 *
 * @param {readonly ContentBlock[]} blocks - the response's content blocks; non-`text` blocks are skipped.
 * @returns {Map<string, string>} the `url → cited_text` map (empty when no citations are present).
 */
export function citationSnippets(blocks) {
  const map = new Map()
  for (const block of blocks) {
    if (block.type !== 'text') continue
    for (const cite of block.citations ?? []) {
      if (cite.url != null && cite.url.length > 0 && cite.cited_text != null && cite.cited_text.length > 0 && !map.has(cite.url)) {
        map.set(cite.url, cite.cited_text)
      }
    }
  }
  return map
}

/**
 * Map a DeepSeek Anthropic Messages response to a normalized search result. Walks
 * `web_search_tool_result` blocks for citeable `web_search_result` items, joins each to its
 * citation excerpt as `snippet`, and dedupes by `url` (a `max_uses > 1` request can surface
 * the same URL across searches). The web service owns the final `maxResults` truncation, so
 * `truncated` is always `false` here.
 *
 * @param {AnthropicResponse} response - the parsed Messages response body.
 * @returns {import('@freddie/freddie-web').WebSearchResult} the normalized result with deduped, snippet-joined sources.
 * @throws {WebError} when native search produced no result block.
 */
export function mapAnthropicResponse(response) {
  const blocks = response.content ?? []
  const resultBlocks = blocks.filter(block => block.type === 'web_search_tool_result')
  if (resultBlocks.length === 0) {
    throw new WebError(
      'DeepSeek returned no web_search_tool_result blocks; the request may not have triggered native web search',
      'WEB_PROVIDER_ERROR',
    )
  }

  const snippets = citationSnippets(blocks)
  const seen = new Set()
  const sources = []
  for (const block of resultBlocks) {
    for (const item of block.content ?? []) {
      if (item.type !== 'web_search_result' || item.url.length === 0 || seen.has(item.url)) continue
      seen.add(item.url)
      const snippet = snippets.get(item.url)
      sources.push({
        url: item.url,
        ...item.title != null && item.title.length > 0 ? { title: item.title } : {},
        ...snippet != null && snippet.length > 0 ? { snippet } : {},
        ...item.page_age != null && item.page_age.length > 0 ? { publishedAt: item.page_age } : {},
      })
    }
  }
  return { sources, truncated: false }
}

export class DeepSeekSearchProvider {
  id = DEEPSEEK_PROVIDER_ID

  /**
   * @param {() => DeepSeekSearchProviderOptions} resolveOptions - the options for the NEXT
   *   operation, snapshotted once at each operation's entry so one search never mixes two
   *   sections. A thunk rather than a value because a settings write can land mid-search.
   */
  constructor(resolveOptions) {
    this.resolveOptions = resolveOptions
  }

  available() {
    const options = this.resolveOptions()
    return ((options.apiKey?.length ?? 0) > 0 || options.resolveApiKey !== undefined)
      && URL.canParse(options.baseURL)
      && isPositiveInteger(options.maxTokens)
      && isPositiveInteger(options.maxUses)
  }

  /**
   * @param {import('@freddie/freddie-web').WebSearchRequest} request
   * @param {AbortSignal} [signal]
   * @returns {Promise<import('@freddie/freddie-web').WebSearchResult>}
   */
  async search(request, signal) {
    const options = this.resolveOptions()
    const apiKey = await this.apiKey(options, signal)
    throwIfSearchAborted(signal)
    const endpoint = `${options.baseURL}/messages`
    const body = {
      model: options.model,
      max_tokens: options.maxTokens,
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: `Perform a web search for the query: ${request.query}` }],
      }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: options.maxUses }],
    }
    options.recordRequest?.({
      endpoint,
      apiVersion: options.apiVersion,
      body,
    })
    throwIfSearchAborted(signal)
    let response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'x-api-key': apiKey,
          'authorization': `Bearer ${apiKey}`,
          'anthropic-version': options.apiVersion,
          'content-type': 'application/json',
          'accept': 'application/json',
          'user-agent': USER_AGENT,
        },
        body: JSON.stringify(body),
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      throw searchEndpointError(
        endpoint,
        `DeepSeek search request failed: ${String(error)}`,
        error,
      )
    }

    if (!response.ok) {
      const status = response.status
      let message = `DeepSeek API error (HTTP ${status})`
      try {
        const parsed = await response.json()
        const detail = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message ?? parsed.message
        if (detail !== undefined && detail.length > 0) message += `: ${detail}`
      } catch (error) {
        if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      }
      throw searchEndpointError(endpoint, message)
    }

    try {
      const payload = await response.json()
      return mapAnthropicResponse(payload)
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      const message = error instanceof WebError
        ? error.message
        : `DeepSeek returned an unprocessable response body: ${String(error)}`
      throw searchEndpointError(endpoint, message, error)
    }
  }

  /**
   * Resolve one operation's credential without retaining it on the provider.
   * @param {DeepSeekSearchProviderOptions} options - the caller's snapshot, so the key and the endpoint it is sent to come from one section.
   * @param {AbortSignal} [signal] - abort signal for the surrounding search.
   * @returns {Promise<string>} the resolved key.
   */
  async apiKey(options, signal) {
    throwIfSearchAborted(signal)
    if (options.apiKey !== undefined && options.apiKey.length > 0) return options.apiKey
    let resolved
    try {
      resolved = await abortable(options.resolveApiKey?.() ?? Promise.resolve(undefined), signal)
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      throw new WebError(
        `DeepSeek search credential resolution failed: ${String(error)}`,
        'WEB_PROVIDER_ERROR',
        { cause: error },
      )
    }
    if (resolved !== undefined && resolved.length > 0) return resolved
    const ref = options.apiKeyEnv ?? 'DEEPSEEK_API_KEY'
    throw new WebError(
      `DeepSeek search has no API key for "${ref}"; store it through the credentials service`
      + ' (the web Models page writes it), export it in the launching environment, or set a literal'
      + ' "apiKey" in the web-search-deepseek config',
      'WEB_PROVIDER_CREDENTIAL_MISSING',
    )
  }
}

function searchEndpointError(endpoint, message, cause) {
  return new WebError(
    `${message}\n\nThe web search request used endpoint ${JSON.stringify(endpoint)}. `
    + 'Search endpoint configuration is separate from chat. If that endpoint is not intended, '
    + 'guide the user to Settings > Plugins > Plugin configuration > Web search, where they can '
    + 'change and save Endpoint. If that settings page is unavailable, the user can set '
    + 'DEEPSEEK_SEARCH_BASE_URL or configure web-search-deepseek.baseURL to a trusted '
    + 'Anthropic-compatible Messages API base. Only the user should choose or change the endpoint.',
    'WEB_PROVIDER_ERROR',
    cause === undefined ? undefined : { cause },
  )
}

function abortable(operation, signal) {
  if (signal === undefined) return operation
  if (signal.aborted) return Promise.reject(searchAborted(signal))
  return new Promise((resolve, reject) => {
    const onAbort = () => { reject(searchAborted(signal)) }
    signal.addEventListener('abort', onAbort, { once: true })
    void operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(new Error(String(error).replace(/^Error: /u, ''), { cause: error }))
      },
    )
  })
}

function throwIfSearchAborted(signal) {
  if (signal?.aborted === true) throw searchAborted(signal)
}

function searchAborted(signal, fallback) {
  return new WebError('DeepSeek search aborted', 'WEB_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  })
}

function isAbortError(error) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0
}
