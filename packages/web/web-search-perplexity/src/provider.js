
import { WebError } from '@freddie/freddie-web'

export const PERPLEXITY_PROVIDER_ID = 'perplexity'

export const PERPLEXITY_DEFAULT_BASE_URL = 'https://api.perplexity.ai'

export const PERPLEXITY_DEFAULT_MODEL = 'sonar'

export const PERPLEXITY_DEFAULT_MAX_TOKENS = 1024

const USER_AGENT = 'freddie/0.0.1'

export function mapPerplexityResult(result) {
  return {
    url: result.url,
    ...result.title != null && result.title.length > 0 ? { title: result.title } : {},
    ...result.snippet != null && result.snippet.length > 0 ? { snippet: result.snippet } : {},
    ...result.date != null && result.date.length > 0 ? { publishedAt: result.date } : {},
  }
}

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

  constructor(options) {
    this.options = options
  }

  available() {
    return this.options.apiKey.length > 0
      && URL.canParse(this.options.baseURL)
      && isPositiveInteger(this.options.maxTokens)
  }

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
