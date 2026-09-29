/**
 * Perplexity search over its OpenAI-compatible chat-completions endpoint. The generated answer
 * becomes `content`; sources prefer structured `search_results[]` and fall back to URL-only
 * `citations[]`. The wire format and native `fetch` client are provider-private and do not use
 * `ctx.llm`.
 *
 * @typedef {'day' | 'week' | 'month' | 'year'} PerplexityRecency Recency filter values Perplexity accepts for `search_recency_filter`.
 * @typedef {{ url: string; title?: string | null; snippet?: string | null; date?: string | null }} PerplexitySearchResult
 *   One structured search result (the preferred citation shape).
 * @typedef {{ choices?: { message?: { content?: string | null } }[]; search_results?: PerplexitySearchResult[]; citations?: string[] }} PerplexityResponse
 *   Perplexity's response envelope. `search_results` is structured citation data (preferred);
 *   `citations` is the URL-only fallback.
 * @typedef {{ error?: { message?: string } | string; message?: string }} PerplexityError
 *   Perplexity's error response envelope (best-effort; fields vary).
 * @typedef {{ apiKey: string; baseURL: string; model: string; maxTokens: number; searchRecency?: PerplexityRecency }} PerplexitySearchProviderOptions
 *   Resolved provider options (the plugin's `apply` supplies env-var and constant defaults).
 *   `apiKey` empty/absent makes the provider unavailable.
 */

import { WebError } from '@freddie/freddie-web'

export const PERPLEXITY_PROVIDER_ID = 'perplexity'

export const PERPLEXITY_DEFAULT_BASE_URL = 'https://api.perplexity.ai'

export const PERPLEXITY_DEFAULT_MODEL = 'sonar'

export const PERPLEXITY_DEFAULT_MAX_TOKENS = 1024

const USER_AGENT = 'freddie/0.0.1'

/**
 * Map one structured Perplexity search result to a normalized source.
 *
 * @param {PerplexitySearchResult} result - one entry of the response's `search_results[]`.
 * @returns {import('@freddie/freddie-web').WebSearchSource} the normalized source; blank fields are omitted rather than set empty.
 */
export function mapPerplexityResult(result) {
  return {
    url: result.url,
    ...result.title != null && result.title.length > 0 ? { title: result.title } : {},
    ...result.snippet != null && result.snippet.length > 0 ? { snippet: result.snippet } : {},
    ...result.date != null && result.date.length > 0 ? { publishedAt: result.date } : {},
  }
}

/**
 * Map a Perplexity response envelope to a normalized search result. Prefers
 * structured `search_results[]`; falls back to URL-only `citations[]` (those
 * sources carry just a `url`) only when `search_results` is absent.
 *
 * @param {PerplexityResponse} response - the parsed chat-completions response body.
 * @returns {import('@freddie/freddie-web').WebSearchResult} the normalized result; `content` is omitted when the answer is empty.
 */
export function mapPerplexityResponse(response) {
  const content = response.choices?.[0]?.message?.content
  const sources = response.search_results !== undefined
    ? response.search_results.map(mapPerplexityResult)
    : (response.citations ?? []).map(url => ({ url }))
  return {
    ...content != null && content.length > 0 ? { content } : {},
    sources,
    truncated: false,
  }
}

export class PerplexitySearchProvider {
  id = PERPLEXITY_PROVIDER_ID

  /** @param {PerplexitySearchProviderOptions} options */
  constructor(options) {
    this.options = options
  }

  available() {
    return this.options.apiKey.length > 0
      && URL.canParse(this.options.baseURL)
      && isPositiveInteger(this.options.maxTokens)
  }

  /**
   * @param {import('@freddie/freddie-web').WebSearchRequest} request
   * @param {AbortSignal} [signal]
   * @returns {Promise<import('@freddie/freddie-web').WebSearchResult>}
   */
  async search(request, signal) {
    let response
    try {
      response = await fetch(`${this.options.baseURL}/chat/completions`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'authorization': `Bearer ${this.options.apiKey}`,
          'content-type': 'application/json',
          'accept': 'application/json',
          'user-agent': USER_AGENT,
        },
        body: JSON.stringify({
          model: this.options.model,
          max_tokens: this.options.maxTokens,
          messages: [{ role: 'user', content: request.query }],
          ...this.options.searchRecency !== undefined ? { search_recency_filter: this.options.searchRecency } : {},
        }),
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error) {
      if (isAbortError(error)) throw new WebError('Perplexity search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`Perplexity search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }

    if (!response.ok) {
      const status = response.status
      let message = `Perplexity API error (HTTP ${status})`
      try {
        const parsed = await response.json()
        const detail = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message ?? parsed.message
        if (detail !== undefined && detail.length > 0) message = detail
      } catch (error) {
        if (isAbortError(error)) throw new WebError('Perplexity search aborted', 'WEB_ABORTED', { cause: error })
      }
      throw new WebError(message, 'WEB_PROVIDER_ERROR')
    }

    try {
      const payload = await response.json()
      return mapPerplexityResponse(payload)
    } catch (error) {
      if (isAbortError(error)) throw new WebError('Perplexity search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`Perplexity returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }
}

function isAbortError(error) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0
}
