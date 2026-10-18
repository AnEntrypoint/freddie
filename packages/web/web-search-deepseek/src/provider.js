
import { WebError } from '@freddie/freddie-web'

export const DEEPSEEK_PROVIDER_ID = 'deepseek-official'

export const DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com/anthropic/v1'

export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-flash'

export const DEEPSEEK_DEFAULT_API_VERSION = '2023-06-01'

export const DEEPSEEK_DEFAULT_MAX_TOKENS = 4096

export const DEEPSEEK_DEFAULT_MAX_USES = 5

const USER_AGENT = 'freddie/0.0.1'

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
