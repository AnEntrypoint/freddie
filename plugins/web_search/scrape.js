// DuckDuckGo HTML endpoint scraper.
//
// DuckDuckGo's no-JS "html" endpoint (https://html.duckduckgo.com/html/?q=...)
// renders each result roughly as:
//
//   <a class="result__a" href="...">Title text</a>
//   ...
//   <a class="result__snippet">Snippet text</a>
//
// (there is also a `result__url` element in real markup, but we only need
// title/url/snippet, and the href on `result__a` already carries the URL).
// This is not a JSON API — it's scraped HTML — so the regex below is
// intentionally narrow: it only matches the exact `result__a` / `result__snippet`
// anchor shape DDG has shipped for years. If DDG changes markup, this regex
// will stop matching and results will silently come back empty; the test
// file (scrape.test.js) pins the expected shape against a fixture so a
// markup change shows up as a loud test failure instead.
const RESULT_RE = /<a class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g

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
            url: unescapeHtmlEntities(m[1]),
            title: cleanText(m[2]),
            snippet: cleanText(m[3]),
        })
    }
    return results
}
