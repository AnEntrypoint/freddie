// Merged web plugin: search (DuckDuckGo/SerpAPI), fetch (plain HTTP), and
// browse (puppeteer-core automation), gated by the website-policy/url-safety
// modules under lib/. Formerly separate plugins/{browser,web_tools,web_search,
// website_policy,url_safety}.
import { webSearch } from './lib/search.js'
import { webFetch } from './lib/fetch.js'
import { browse } from './lib/browse.js'

export default {
    name: 'web',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register({
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
            handler: async (args) => webSearch(args),
        })

        pi.tools.register({
            name: 'web_fetch',
            toolset: 'browse',
            schema: {
                name: 'web_fetch',
                description: 'Fetch a URL and return text/json/headers. Gated by url_safety and website_policy.',
                parameters: {
                    type: 'object',
                    properties: {
                        url: { type: 'string' },
                        method: { type: 'string', default: 'GET' },
                        headers: {},
                        body: { type: 'string' },
                        parse: { type: 'string', enum: ['text', 'json'] },
                    },
                    required: ['url'],
                },
            },
            handler: async (args) => webFetch(args),
        })

        pi.tools.register({
            name: 'browser',
            toolset: 'browse',
            schema: {
                name: 'browser',
                description: 'Browser automation: navigate, click, type, evaluate, screenshot. Requires puppeteer-core. Navigation gated by url_safety and website_policy.',
                parameters: {
                    type: 'object',
                    properties: {
                        action: { type: 'string', enum: ['navigate', 'click', 'type', 'evaluate', 'screenshot', 'text'] },
                        url: { type: 'string' },
                        selector: { type: 'string' },
                        text: { type: 'string' },
                        script: { type: 'string' },
                        path: { type: 'string' },
                    },
                    required: ['action'],
                },
            },
            checkFn: () => true,
            requiresEnv: ['puppeteer-core'],
            handler: async (args) => browse(args),
        })
    },
}
