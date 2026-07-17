// Plain HTTP fetch + HTML->text extraction, gated by url-safety and
// website-policy before any request goes out.
import { checkUrlSafety } from './url-safety.js'
import { checkWebsitePolicy } from './website-policy.js'

export async function webFetch({ url, method = 'GET', headers = {}, body, parse = 'text' }) {
    const safety = checkUrlSafety(url)
    if (!safety.safe) return { error: 'blocked by url_safety: ' + safety.reason }
    const policy = checkWebsitePolicy(url)
    if (policy.decision === 'deny') return { error: 'blocked by website_policy' + (policy.reason ? ': ' + policy.reason : '') }

    const r = await fetch(url, { method, headers, body })
    const ct = r.headers.get('content-type')
    const out = parse === 'json' ? await r.json().catch(() => null) : await r.text()
    return { status: r.status, contentType: ct, body: out }
}

// Strips <script>/<style> blocks and remaining tags from HTML, collapsing
// whitespace, to produce plain text. Used internally by callers that want
// text out of an already-fetched HTML body (not registered as its own tool).
export function extractHtmlText(html) {
    return String(html)
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}
