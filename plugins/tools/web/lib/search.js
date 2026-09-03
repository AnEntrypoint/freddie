// Web search: SerpAPI when SERPAPI_KEY is configured, otherwise scrapes the
// DuckDuckGo no-JS "html" endpoint (https://html.duckduckgo.com/html/?q=...).
// Supports include_content (page crawling via fetchURL) and num_results.
// In-memory cache with 5-minute TTL to avoid duplicate API calls.
import { env } from '../../../../src/env.js'
import { fetchURL } from './fetch_url.js'

// DuckDuckGo's html endpoint renders each result roughly as:
//
//   <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=<encoded-real-url>&rut=...">Title text</a>
//   ...
//   <a class="result__snippet" href="...">Snippet text</a>
//
// (there is also a `result__url` element in real markup, but we only need
// title/url/snippet, and the href on `result__a` already carries the URL,
// wrapped in DDG's own click-redirect -- see unwrapDdgRedirect below).
// This is not a JSON API — it's scraped HTML — so the regex below is
// intentionally narrow: it only matches the `result__a` / `result__snippet`
// anchor shape DDG has shipped for years. DDG has since added a `rel="nofollow"`
// attribute BEFORE `class="result__a"` on the anchor (live-witnessed: matched
// zero results against a real DDG response until this was fixed) -- the class
// match below no longer assumes `class` is the first/only attribute on the
// anchor (attribute-order tolerant), NOR that `result__a`/`result__snippet`
// is the ONLY token in the `class` attribute's value (matches `class="result__a
// js-some-other-token"` too, a real HTML pattern DDG could add with zero
// notice -- an exact-string `class="result__a"` match would silently revert
// to the same zero-results failure this fix addresses the moment a second
// class token appears). If DDG changes the class NAMES themselves, this
// regex will still stop matching and results will silently come back empty.
const RESULT_RE = /<a [^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a [^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g

// DDG's html endpoint never links directly to the result -- every result__a/
// result__snippet href is DDG's own click-tracking redirect
// (`//duckduckgo.com/l/?uddg=<url-encoded-real-url>&rut=<token>`), so the raw
// regex-captured href is DDG's own URL, not the page the result is actually
// about. Unwrap it to the real target when the shape matches; otherwise
// return the href unchanged (a defensive fallback, not an error, in case DDG
// ever links directly or changes the redirect's query param name).
function unwrapDdgRedirect(href) {
    try {
        const u = new URL(href, 'https://duckduckgo.com')
        const real = u.searchParams.get('uddg')
        return real ? real : href
    } catch { return href }
}

// Minimal standard HTML entity unescaping. DDG's HTML endpoint only ever
// emits this small standard set inside text nodes (titles/snippets), so we
// don't pull in a full HTML-entity table — just the ones that actually show
// up: &amp; &lt; &gt; &quot; &#39; (and the numeric equivalent &#x27;).
// IMPORTANT: &amp; must be unescaped LAST, otherwise a title containing a
// literal "&lt;" would double-decode into "<" incorrectly (DDG itself
// double-escapes entities, e.g. "&amp;lt;" for a literal "&lt;" in source
// text, so decoding &amp; first would prematurely unescape it).
function unescapeHtmlEntities(str) {
    return String(str)
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0*39;|&#x0*27;/gi, "'")
        .replace(/&amp;/g, '&')
}

// Strips the <b>/</b> highlight tags DDG wraps around matched query terms
// inside snippets, then unescapes entities.
function cleanText(raw) {
    return unescapeHtmlEntities(String(raw).replace(/<\/?b>/g, ''))
}

// Parses DDG html-endpoint markup into { title, url, snippet } results,
// stopping once `limit` results have been collected.
export function parseDdgHtml(html, limit = 5) {
    const results = []
    if (!html) return results
    RESULT_RE.lastIndex = 0
    let m
    while ((m = RESULT_RE.exec(html)) && results.length < limit) {
        results.push({
            url: unwrapDdgRedirect(unescapeHtmlEntities(m[1])),
            title: cleanText(m[2]),
            snippet: cleanText(m[3]),
        })
    }
    return results
}

// In-memory cache: Map<queryKey, {results, timestamp}>. TTL = 5 minutes.
const _searchCache = new Map()
const CACHE_TTL_MS = 5 * 60 * 1000

function cacheKey(query, numResults) {
    return `${query}::${numResults}`
}

function cacheGet(query, numResults) {
    const entry = _searchCache.get(cacheKey(query, numResults))
    if (!entry) return null
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        _searchCache.delete(cacheKey(query, numResults))
        return null
    }
    return entry.results
}

function cacheSet(query, numResults, results) {
    _searchCache.set(cacheKey(query, numResults), { results, timestamp: Date.now() })
}

export async function webSearch({ query, limit, num_results, include_content }) {
    // num_results takes precedence over limit; default 10, max 20
    const count = Math.min(num_results || limit || 10, 20)

    // Check cache first
    const cached = cacheGet(query, count)
    if (cached) return { results: cached }

    let results

    if (env('SERPAPI_KEY')) {
        const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${env('SERPAPI_KEY')}&num=${count}`
        const data = await fetch(url).then(r => r.json())
        results = (data.organic_results || []).slice(0, count).map(r => {
            const row = { title: r.title, url: r.link, snippet: r.snippet }
            if (r.date) row.date = r.date
            return row
        })
    } else {
        const fetchFn = globalThis.__freddieFetch || fetch
        const html = await fetchFn(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`).then(r => r.text())
        results = parseDdgHtml(html, count)
    }

    // Cache results
    cacheSet(query, count, results)

    // If include_content is true, fetch each result's page content
    if (include_content) {
        const enriched = await Promise.all(results.map(async (r) => {
            try {
                const fetchResult = await fetchURL(r.url)
                return {
                    ...r,
                    content: fetchResult.ok ? fetchResult.content : null,
                    content_type: fetchResult.ok ? fetchResult.content_type : null,
                    content_error: fetchResult.ok ? null : fetchResult.error,
                }
            } catch {
                return { ...r, content: null, content_type: null, content_error: 'fetch failed' }
            }
        }))
        return { results: enriched }
    }

    return { results }
}