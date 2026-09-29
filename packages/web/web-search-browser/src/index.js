import z from '@freddie/schemastery'
import { BrowserSearchProvider, BROWSER_PROVIDER_ID, SEARCH_BASE_URL } from './provider.js'

export { BrowserSearchProvider, BROWSER_PROVIDER_ID, SEARCH_BASE_URL } from './provider.js'

export const name = 'web-search-browser'

export const inject = ['web', 'gm']

export const Config = z.object({
  timeoutMs: z.number().step(1).min(1).default(30_000),
})

export function apply(ctx, config) {
  ctx.web.registerSearchProvider(new BrowserSearchProvider(ctx.gm, { timeoutMs: config.timeoutMs }))
}
