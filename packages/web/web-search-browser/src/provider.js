import { WebError } from '@freddie/freddie-web'

export const BROWSER_PROVIDER_ID = 'browser-google'

export const SEARCH_BASE_URL = 'https://www.google.com/search'

export const MAX_EXTRACTED_ROWS = 20

const RESOLVE_TIMEOUT_MS = 4_000

const BLOCK_MARKERS = ['unusual traffic', 'not a robot', 'consent.google.com', 'before you continue to google search']

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

export class BrowserSearchProvider {
  id = BROWSER_PROVIDER_ID

  constructor(gm, options = {}) {
    this.gm = gm
    this.timeoutMs = options.timeoutMs ?? 30_000
  }

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

function isAbortError(error) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function searchAborted(signal, fallback) {
  return new WebError('browser search aborted', 'WEB_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  })
}
