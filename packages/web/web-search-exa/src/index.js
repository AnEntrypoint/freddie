import { launchEnvironmentOf } from '@freddie/freddie-launch-environment'
import z from '@freddie/schemastery'
import {
  ExaSearchProvider,
  EXA_DEFAULT_BASE_URL,
  EXA_DEFAULT_HIGHLIGHTS_PER_RESULT,
  EXA_DEFAULT_SEARCH_TYPE,
} from './provider.js'

export {
  EXA_DEFAULT_BASE_URL,
  EXA_DEFAULT_HIGHLIGHTS_PER_RESULT,
  EXA_DEFAULT_SEARCH_TYPE,
  EXA_PROVIDER_ID,
  ExaSearchProvider,
} from './provider.js'

export const name = 'web-search-exa'

export const inject = ['web']

export const Config = z.object({
  apiKey: z.string(),
  baseURL: z.string(),
  searchType: z.union(['auto', 'keyword', 'neural']),
  numResults: z.number().step(1).min(1),
  highlightsPerResult: z.number().step(1).min(1),
})

export function apply(ctx, config) {
  ctx.web.registerSearchProvider(new ExaSearchProvider({
    apiKey: config.apiKey ?? launchEnvironmentOf(ctx).get('EXA_API_KEY')?.value ?? '',
    baseURL: config.baseURL ?? EXA_DEFAULT_BASE_URL,
    searchType: config.searchType ?? EXA_DEFAULT_SEARCH_TYPE,
    highlightsPerResult: config.highlightsPerResult ?? EXA_DEFAULT_HIGHLIGHTS_PER_RESULT,
    ...config.numResults !== undefined ? { numResults: config.numResults } : {},
  }))
}
