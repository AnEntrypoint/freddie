/**
 * Perplexity-backed `WebSearchProvider` plugin. It contributes to the
 * `ctx.web` registry without owning the service.
 */

import { launchEnvironmentOf } from '@freddie/freddie-launch-environment'
import z from '@freddie/schemastery'
import { PerplexitySearchProvider, PERPLEXITY_DEFAULT_BASE_URL, PERPLEXITY_DEFAULT_MAX_TOKENS, PERPLEXITY_DEFAULT_MODEL } from './provider.js'

export {
  PERPLEXITY_DEFAULT_BASE_URL,
  PERPLEXITY_DEFAULT_MAX_TOKENS,
  PERPLEXITY_DEFAULT_MODEL,
  PERPLEXITY_PROVIDER_ID,
  PerplexitySearchProvider,
} from './provider.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-perplexity'

/** The web seam this provider registers into. */
export const inject = ['web']

/**
 * @typedef {object} Config
 * @property {string} [apiKey] - Perplexity API key. Falls back to `$PERPLEXITY_API_KEY`. Empty → unavailable.
 * @property {string} [baseURL] - Endpoint base; `/chat/completions` is appended. Defaults to the public API.
 * @property {string} [model] - Search model name. Defaults to `sonar`.
 * @property {number} [maxTokens] - Upper bound on generated answer tokens. Defaults to 1024.
 * @property {'day' | 'week' | 'month' | 'year'} [searchRecency] - Recency window sent as `search_recency_filter`. Omitted = no filter.
 */

export const Config = z.object({
  apiKey: z.string(),
  baseURL: z.string(),
  model: z.string(),
  maxTokens: z.number().step(1).min(1),
  searchRecency: z.union(['day', 'week', 'month', 'year']),
})

/**
 * Register the Perplexity search provider with `ctx.web`.
 * @param {import('@freddie/cordis').Context} ctx
 * @param {Config} config
 */
export function apply(ctx, config) {
  ctx.web.registerSearchProvider(new PerplexitySearchProvider({
    // Every environment layer may name this key: the product trusts the
    // project it is launched in, and the managed store is not involved here.
    apiKey: config.apiKey ?? launchEnvironmentOf(ctx).get('PERPLEXITY_API_KEY')?.value ?? '',
    baseURL: config.baseURL ?? PERPLEXITY_DEFAULT_BASE_URL,
    model: config.model ?? PERPLEXITY_DEFAULT_MODEL,
    maxTokens: config.maxTokens ?? PERPLEXITY_DEFAULT_MAX_TOKENS,
    ...config.searchRecency !== undefined ? { searchRecency: config.searchRecency } : {},
  }))
}
