/**
 * Google search through gm's own `browser` verb (`ctx.gm`, dispatched
 * in-process against the shared agentplug daemon's lightpanda/CDP engine --
 * no Chrome process, no new dependency, no API key). Replaces
 * `@freddie/freddie-web-search-deepseek`, which required a paid DeepSeek
 * Anthropic-compatible key purely to reach the native `web_search` server
 * tool; this provider needs no credential at all.
 *
 * Google was tried directly (not DuckDuckGo, per explicit direction) and
 * works cleanly through this same `browser` verb -- no CAPTCHA, no consent
 * wall, live-verified across several dispatches. If that ever stops holding
 * (a CAPTCHA/consent/"unusual traffic" page instead of real results), `search`
 * throws a distinctly-coded `WEB_PROVIDER_BLOCKED` error naming the page's own
 * text rather than silently returning zero results -- the documented signal
 * to escalate this provider to a stealth engine (camoufox), not a silent
 * degrade.
 * @module @freddie/freddie-web-search-browser/provider
 */

import { WebError } from '@freddie/freddie-web'

/** Stable id this provider registers under. */
export const BROWSER_PROVIDER_ID = 'browser-google'

/** Google's search results endpoint. */
export const SEARCH_BASE_URL = 'https://www.google.com/search'

/** Upper bound on DOM rows extracted before `ctx.web`'s own `maxResults` cap applies. */
export const MAX_EXTRACTED_ROWS = 20

/** Per-result redirect-resolution timeout (ms); a slow/failed resolve keeps the wrapper URL, never blocks the search. */
const RESOLVE_TIMEOUT_MS = 4_000

/** Phrases Google's own anti-automation interstitials use; any hit means blocked, not zero-results. */
const BLOCK_MARKERS = ['unusual traffic', 'not a robot', 'consent.google.com', 'before you continue to google search']

/**
 * Build the in-page extraction script. Google's organic-result markup churns
 * (class names rotate across deploys), so this keys off the one stable
 * structural fact instead: every organic result's title lives in an `<h3>`
 * inside its own result link. The snippet is heuristically the first
 * long-enough text block in the result's ancestor container -- best-effort,
 * omitted rather than guessed wrong when none qualifies. Each link's `href`
 * is Google's own `/url?q=...`/`/goto?url=...` tracking redirect, not the
 * destination -- resolved server-side after this script returns (see
 * `resolveDestination`), never inside the sandboxed page context.
 * @param maxRows - cap on extracted rows (pre-`ctx.web` truncation).
 * @returns the bare-JS body to evaluate after navigation.
 */
function extractionScript(maxRows) {
  return `(() => {
    const rows = Array.from(document.querySelectorAll('a > h3')).slice(0, ${maxRows}).map(h3 => {
      const a = h3.closest('a')
      const container = a?.closest('div[data-hveid], div.g, div.MjjYud') ?? a?.parentElement?.parentElement?.parentElement
      let snippet = ''
      if (container) {
        const blocks = Array.from(container.querySelectorAll('span, div')).map(el => el.textContent).filter(t => t && t.length > 40)
        snippet = blocks[0] ?? ''
      }
      return { url: a?.href, title: h3.textContent, ...(snippet ? { snippet: snippet.slice(0, 300) } : {}) }
    }).filter(r => r.url && r.url.startsWith('http'))
    return JSON.stringify({ rows, bodyText: document.body.innerText.slice(0, 500) })
  })()`
}

/**
 * Resolve one Google tracking-redirect URL to its real destination by reading
 * the `Location` header directly, no session/cookies needed. Must be GET,
 * not HEAD -- live-verified: Google's `/goto` responds 200 with no redirect
 * at all to a HEAD request, only firing the real 302 for GET. `redirect:
 * 'manual'` stops fetch from itself following that 302 and downloading the
 * destination page's body, which this call never needs. Best-effort: any
 * failure, timeout, or non-redirect response keeps the original wrapper URL
 * rather than dropping the result.
 * @param url - the raw `href` extracted from the results page.
 * @returns the resolved destination, or `url` unchanged if resolution failed.
 */
async function resolveDestination(url) {
  if (!/^https:\/\/(www\.)?google\.[^/]+\/(url|goto)\?/.test(url)) return url
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS)
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'manual', signal: controller.signal })
    const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null
    return location !== null && location.length > 0 ? location : url
  } catch (error) {
    return url
  } finally {
    clearTimeout(timer)
  }
}

/** The Google-via-browser-automation search provider. Needs no credential. */
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
    let parsed
    try {
      parsed = raw === undefined ? { rows: [], bodyText: '' } : JSON.parse(raw)
    } catch (error) {
      throw new WebError(`browser search returned an unparsable result: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    const rows = Array.isArray(parsed?.rows) ? parsed.rows : []
    if (rows.length === 0) {
      const bodyText = typeof parsed?.bodyText === 'string' ? parsed.bodyText : ''
      const marker = BLOCK_MARKERS.find((m) => bodyText.toLowerCase().includes(m))
      if (marker !== undefined) {
        throw new WebError(
          `browser search (${BROWSER_PROVIDER_ID}) was blocked by Google's anti-automation page (matched "${marker}") -- escalate to a stealth engine (camoufox) for this provider`,
          'WEB_PROVIDER_BLOCKED',
        )
      }
    }
    const resolved = await Promise.all(
      rows
        .filter((row) => typeof row?.url === 'string' && row.url.length > 0)
        .map(async (row) => ({
          url: await resolveDestination(row.url),
          ...(typeof row.title === 'string' && row.title.length > 0 ? { title: row.title } : {}),
          ...(typeof row.snippet === 'string' && row.snippet.length > 0 ? { snippet: row.snippet } : {}),
        })),
    )
    return { sources: resolved, truncated: false }
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
