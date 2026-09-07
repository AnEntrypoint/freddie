/**
 * DuckDuckGo HTML-results search through gm's own `browser` verb (`ctx.gm`,
 * dispatched in-process against the shared agentplug daemon's lightpanda/CDP
 * engine -- no Chrome process, no new dependency, no API key). Replaces
 * `@freddie/freddie-web-search-deepseek`, which required a paid DeepSeek
 * Anthropic-compatible key purely to reach the native `web_search` server
 * tool; this provider needs no credential at all.
 * @module @freddie/freddie-web-search-browser/provider
 */

import { WebError } from '@freddie/freddie-web'

/** Stable id this provider registers under. */
export const BROWSER_PROVIDER_ID = 'browser-duckduckgo'

/** DuckDuckGo's no-JS HTML results endpoint -- stable markup, no client-side rendering required. */
export const SEARCH_BASE_URL = 'https://html.duckduckgo.com/html/'

/** Upper bound on DOM rows extracted before `ctx.web`'s own `maxResults` cap applies. */
export const MAX_EXTRACTED_ROWS = 20

/**
 * Build the in-page extraction script. DuckDuckGo's HTML results wrap each
 * hit in `.result`, with the link/title in `.result__a` and the excerpt in
 * `.result__snippet`. `.result__a`'s `href` is a DuckDuckGo redirect
 * (`/l/?uddg=<encoded-real-url>&rut=...`), not the destination -- decoded
 * here, in-page, so the provider never has to post-process it.
 * @param maxRows - cap on extracted rows (pre-`ctx.web` truncation).
 * @returns the bare-JS body to evaluate after navigation.
 */
function extractionScript(maxRows) {
  return `JSON.stringify(Array.from(document.querySelectorAll('.result')).slice(0, ${maxRows}).map(el => {
    const a = el.querySelector('.result__a')
    const raw = a?.href
    let url = raw
    try { url = new URL(raw).searchParams.get('uddg') ?? raw } catch (e) {}
    const snippet = el.querySelector('.result__snippet')?.textContent?.trim()
    return { url, title: a?.textContent?.trim(), ...(snippet ? { snippet } : {}) }
  }).filter(r => r.url))`
}

/** The DuckDuckGo-via-browser-automation search provider. Needs no credential. */
export class BrowserSearchProvider {
  id = BROWSER_PROVIDER_ID

  /**
   * @param gm - `ctx.gm` (the native gm-client service); dispatches the `browser` verb.
   * @param options.timeoutMs - per-search dispatch timeout (default 30000, matching tool-web's own search budget).
   */
  constructor(gm, options = {}) {
    this.gm = gm
    this.timeoutMs = options.timeoutMs ?? 30_000
  }

  /** No credential to check; the provider is ready whenever it is registered. */
  available() {
    return true
  }

  async search(request, signal) {
    if (signal?.aborted === true) throw searchAborted(signal)
    const url = `${SEARCH_BASE_URL}?q=${encodeURIComponent(request.query)}`
    const rawBody = `url=${url}\n${extractionScript(MAX_EXTRACTED_ROWS)}`
    let response
    try {
      response = await this.gm.call('browser', {}, {
        rawBody,
        timeoutMs: this.timeoutMs,
        ...signal === undefined ? {} : { signal },
      })
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      throw new WebError(`browser search dispatch failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    if (signal?.aborted === true) throw searchAborted(signal)
    // The daemon's own response shape differs by outcome (live-verified, not
    // guessed): success wraps the engine's own {result, stderr, ...} under a
    // `data` key alongside a mirrored top-level `ok`; a transport-level
    // failure (e.g. the engine unavailable, an empty script body) has no
    // `data` wrapper at all and puts `error`/`stderr`/`note` at the top level
    // instead. Top-level `ok` is reliable in both shapes.
    if (response?.ok !== true) {
      const detail = response?.error || response?.stderr || response?.note || response?.error_code || 'unknown transport failure'
      throw new WebError(`browser search (${BROWSER_PROVIDER_ID}) failed: ${detail}`, 'WEB_PROVIDER_ERROR')
    }
    if (response.data?.ok !== true) {
      const detail = response.data?.stderr || 'the browser engine reported a non-ok result with no stderr detail'
      throw new WebError(`browser search (${BROWSER_PROVIDER_ID}) evaluation failed: ${detail}`, 'WEB_PROVIDER_ERROR')
    }
    const raw = response.data?.result
    let rows
    try {
      rows = raw === undefined ? [] : JSON.parse(raw)
    } catch (error) {
      throw new WebError(`browser search returned an unparsable result: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    if (!Array.isArray(rows)) {
      throw new WebError('browser search extraction script returned a non-array result', 'WEB_PROVIDER_ERROR')
    }
    const sources = rows
      .filter((row) => typeof row?.url === 'string' && row.url.length > 0)
      .map((row) => ({
        url: row.url,
        ...(typeof row.title === 'string' && row.title.length > 0 ? { title: row.title } : {}),
        ...(typeof row.snippet === 'string' && row.snippet.length > 0 ? { snippet: row.snippet } : {}),
      }))
    return { sources, truncated: false }
  }
}

/** True for a fetch/`AbortSignal` abort, matching the sibling DeepSeek provider's contract. */
function isAbortError(error) {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Build the provider's stable cancellation error while retaining the caller's reason. */
function searchAborted(signal, fallback) {
  return new WebError('browser search aborted', 'WEB_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  })
}
