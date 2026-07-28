// Pure fetch utility shared by web_fetch and web_search tools.
// Works in both Node 18+ and browser — no Node.js-specific APIs.
// Browser-like User-Agent, HTML text extraction, graceful error handling.

/**
 * Fetch a URL with browser-like behavior.
 * Extracts text content from HTML, returns raw body for other types.
 * Adds a note at the top of the content indicating the type.
 *
 * @param {string} url - The URL to fetch
 * @param {object} [opts]
 * @param {number} [opts.timeout=30000] - Timeout in ms
 * @param {string} [opts.userAgent='Mozilla/5.0 (compatible; Freddie/1.0)'] - User-Agent header
 * @returns {Promise<{ok: boolean, url: string, content?: string, content_type?: string, status_code?: number, content_length?: number, headers?: object, error?: string}>}
 */
export async function fetchURL(url, { timeout = 30000, userAgent = 'Mozilla/5.0 (compatible; Freddie/1.0)' } = {}) {
  // Validate URL
  try { new URL(url) } catch { return { ok: false, url, error: 'Invalid URL' } }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { ok: false, url, error: 'Only http/https URLs are supported' }
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    const resp = await fetch(url, {
      headers: { 'User-Agent': userAgent },
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timer)

    const rawBody = await resp.text()
    const contentType = resp.headers.get('content-type') || ''

    let content, content_type
    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      // Extract text from HTML
      content = extractText(rawBody)
      content_type = 'extracted'
    } else {
      content = rawBody
      content_type = 'raw'
    }

    const note = content_type === 'extracted' ? '[Content extracted from URL]' : '[Full response body]'

    return {
      ok: true,
      url,
      content: `${note}\n\n${content}`,
      content_type,
      status_code: resp.status,
      content_length: content.length,
      headers: Object.fromEntries(resp.headers.entries()),
    }
  } catch (err) {
    let message = err.message
    if (err.name === 'AbortError') message = 'Request timed out'
    return { ok: false, url, error: message }
  }
}

/**
 * Strip HTML tags, scripts, and styles, collapsing whitespace to plain text.
 * Handles the most common HTML entities.
 * @param {string} html - Raw HTML string
 * @returns {string} Plain text
 */
export function extractText(html) {
  return String(html)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}