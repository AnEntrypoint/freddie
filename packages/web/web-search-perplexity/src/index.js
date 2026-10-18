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

export const name = 'web-search-perplexity'

export const inject = ['web']


export const Config = z.object({
  apiKey: z.string(),
  baseURL: z.string(),
  model: z.string(),
  maxTokens: z.number().step(1).min(1),
  searchRecency: z.union(['day', 'week', 'month', 'year']),
})

export function apply(ctx, config) {
  ctx.web.registerSearchProvider(new PerplexitySearchProvider({
    apiKey: config.apiKey ?? launchEnvironmentOf(ctx).get('PERPLEXITY_API_KEY')?.value ?? '',
    baseURL: config.baseURL ?? PERPLEXITY_DEFAULT_BASE_URL,
    model: config.model ?? PERPLEXITY_DEFAULT_MODEL,
    maxTokens: config.maxTokens ?? PERPLEXITY_DEFAULT_MAX_TOKENS,
    ...config.searchRecency !== undefined ? { searchRecency: config.searchRecency } : {},
  }))
}
