/**
 * Register a DuckDuckGo-via-`ctx.gm`-`browser`-verb search provider in
 * `ctx.web`. Needs no API key: it reuses the shared gm daemon's own
 * lightpanda/CDP browser-automation engine already wired into this process
 * through `@freddie/freddie-gm-client`.
 * @module @freddie/freddie-web-search-browser
 */

import z from '@freddie/schemastery'
import { BrowserSearchProvider, BROWSER_PROVIDER_ID, SEARCH_BASE_URL } from './provider.js'

export { BrowserSearchProvider, BROWSER_PROVIDER_ID, SEARCH_BASE_URL } from './provider.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-browser'

/** The web seam this provider registers into, plus `gm` for the `browser` verb dispatch. */
export const inject = ['web', 'gm']

export const Config = z.object({
  timeoutMs: z.number().step(1).min(1).default(30_000),
})

/** Register the browser-automation search provider with `ctx.web`. */
export function apply(ctx, config) {
  ctx.web.registerSearchProvider(new BrowserSearchProvider(ctx.gm, { timeoutMs: config.timeoutMs }))
}
