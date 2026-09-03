// Plain HTTP fetch + HTML->text extraction, gated by url-safety and
// website-policy before any request goes out. Uses the shared fetchURL
// utility for browser-like behavior and graceful error handling.
import { checkUrlSafety } from './url-safety.js'
import { checkWebsitePolicy } from './website-policy.js'
import { fetchURL, extractText } from './fetch_url.js'

export async function webFetch(args) {
  const { url, method = 'GET', headers = {}, body, parse = 'text' } = args

  const safety = await checkUrlSafety(url)
  if (!safety.safe) return { ok: false, error: 'blocked by url_safety: ' + safety.reason }

  const policy = checkWebsitePolicy(url)
  if (policy.decision === 'deny') return { ok: false, error: 'blocked by website_policy' + (policy.reason ? ': ' + policy.reason : '') }

  // For non-GET requests or JSON parse mode, use the raw fetch path
  // (fetchURL always does GET with text extraction).
  if (method !== 'GET' || parse === 'json') {
    try {
      const r = await fetch(url, { method, headers, body })
      const ct = r.headers.get('content-type')
      const out = parse === 'json' ? await r.json().catch(() => null) : await r.text()
      return { ok: true, status: r.status, contentType: ct, body: out }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  }

  const result = await fetchURL(url)
  return result
}

export { extractText }