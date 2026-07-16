import { env } from '../../src/env.js'

import { parseDdgHtml } from './scrape.js'

export const _tool = ({
    name: 'web_search',
    toolset: 'browse',
    schema: {
        name: 'web_search',
        description: 'Search the web (DuckDuckGo HTML or SerpAPI). Returns title/url/snippet list.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string' },
                limit: { type: 'number', default: 5 },
            },
            required: ['query'],
        },
    },
    checkFn: () => true,
    requiresEnv: ['SERPAPI_KEY (optional, falls back to DDG)'],
    handler: async ({ query, limit = 5 }) => {
        if (env('SERPAPI_KEY')) {
            const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${env('SERPAPI_KEY')}`
            const data = await fetch(url).then(r => r.json())
            const results = (data.organic_results || []).slice(0, limit).map(r => ({ title: r.title, url: r.link, snippet: r.snippet }))
            return { results }
        }
        const fetchFn = globalThis.__freddieFetch || fetch
        const html = await fetchFn(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`).then(r => r.text())
        return { results: parseDdgHtml(html, limit) }
    },
})
