import { WebError } from '@freddie/freddie-web'

export const EXA_PROVIDER_ID = 'exa'

export const EXA_DEFAULT_BASE_URL = 'https://api.exa.ai'

export const EXA_DEFAULT_SEARCH_TYPE = 'auto'

export const EXA_DEFAULT_HIGHLIGHTS_PER_RESULT = 1

const USER_AGENT = 'freddie/0.0.1'

export function mapExaResult(result) {
  const snippet = result.highlights?.find(highlight => highlight.trim().length > 0)
  if (snippet === undefined) return undefined
  return {
    url: result.url,
    ...result.title != null && result.title.length > 0 ? { title: result.title } : {},
    snippet,
    ...result.publishedDate != null && result.publishedDate.length > 0 ? { publishedAt: result.publishedDate } : {},
  }
}

export function mapExaResponse(response) {
  const sources = (response.results ?? [])
    .map(mapExaResult)
    .filter((source) => source !== undefined)
  return { sources, truncated: false }
}

export class ExaSearchProvider {
  id = EXA_PROVIDER_ID

  constructor(options) {
    this.options = options
  }

  available() {
    return this.options.apiKey.length > 0
      && isValidBaseUrl(this.options.baseURL)
      && isPositiveInteger(this.options.highlightsPerResult)
      && (this.options.numResults === undefined || isPositiveInteger(this.options.numResults))
  }

  async search(request, signal) {
    const numResults = request.maxResults ?? this.options.numResults
    let response
    try {
      response = await fetch(`${this.options.baseURL}/search`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'authorization': `Bearer ${this.options.apiKey}`,
          'content-type': 'application/json',
          'accept': 'application/json',
          'user-agent': USER_AGENT,
        },
        body: JSON.stringify({
          query: request.query,
          type: this.options.searchType,
          contents: { highlights: { highlightsPerUrl: this.options.highlightsPerResult } },
          ...numResults !== undefined ? { numResults } : {},
        }),
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error) {
      if (isAbortError(error)) throw new WebError('Exa search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`Exa search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }

    if (!response.ok) {
      const status = response.status
      let message = `Exa API error (HTTP ${status})`
      try {
        const parsed = await response.json()
        const detail = parsed.error ?? parsed.message
        if (detail !== undefined && detail.length > 0) message = detail
      } catch (error) {
        if (isAbortError(error)) throw new WebError('Exa search aborted', 'WEB_ABORTED', { cause: error })
      }
      throw new WebError(message, 'WEB_PROVIDER_ERROR')
    }

    try {
      const payload = await response.json()
      return mapExaResponse(payload)
    } catch (error) {
      if (isAbortError(error)) throw new WebError('Exa search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`Exa returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }
}

function isValidBaseUrl(baseURL) {
  return URL.canParse(baseURL)
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0
}

function isAbortError(error) {
  return error instanceof DOMException && error.name === 'AbortError'
}
