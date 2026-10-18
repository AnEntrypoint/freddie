import { credentialRef } from '@freddie/freddie-credentials'
import { installSettingsSection, settingsNamespace } from '@freddie/freddie-settings'
import { launchEnvironmentOf } from '@freddie/freddie-launch-environment'
import z from '@freddie/schemastery'
import {
  DeepSeekSearchProvider,
  DEEPSEEK_DEFAULT_API_VERSION,
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_MAX_TOKENS,
  DEEPSEEK_DEFAULT_MAX_USES,
  DEEPSEEK_DEFAULT_MODEL,
} from './provider.js'

export {
  DeepSeekSearchProvider,
  DEEPSEEK_DEFAULT_API_VERSION,
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_MAX_TOKENS,
  DEEPSEEK_DEFAULT_MAX_USES,
  DEEPSEEK_DEFAULT_MODEL,
  DEEPSEEK_PROVIDER_ID,
} from './provider.js'

export const name = 'web-search-deepseek'

export const inject = ['web']

const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'

const SEARCH_BASE_URL_ENV = 'DEEPSEEK_SEARCH_BASE_URL'

export const WEB_SEARCH_SETTINGS_NS = 'web-search-deepseek'

export const WEB_SEARCH_SETTINGS_NAMESPACE = settingsNamespace(WEB_SEARCH_SETTINGS_NS)

export const WebSearchSettings = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: z.string(),
  maxUses: z.number().step(1).min(1).default(DEEPSEEK_DEFAULT_MAX_USES),
})

export const Config = z.object({
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: z.string(),
  model: z.string().default(DEEPSEEK_DEFAULT_MODEL),
  apiVersion: z.string().default(DEEPSEEK_DEFAULT_API_VERSION),
  maxTokens: z.number().step(1).min(1).default(DEEPSEEK_DEFAULT_MAX_TOKENS),
  maxUses: z.number().step(1).min(1).default(DEEPSEEK_DEFAULT_MAX_USES),
})

function sectionOf(config) {
  return {
    apiKeyEnv: config.apiKeyEnv ?? DEFAULT_API_KEY_ENV,
    ...config.baseURL === undefined ? {} : { baseURL: config.baseURL },
    maxUses: config.maxUses ?? DEEPSEEK_DEFAULT_MAX_USES,
  }
}

function definedOf(section) {
  return Object.fromEntries(Object.entries(section ?? {}).filter(([, value]) => value !== undefined))
}

function resolveOptions(ctx, config) {
  const apiKeyEnv = credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV)
  const literalApiKey = config.apiKey !== undefined && config.apiKey.length > 0 ? config.apiKey : undefined
  return {
    ...literalApiKey === undefined ? {} : { apiKey: literalApiKey },
    resolveApiKey: async () => {
      const credentials = ctx.get('credentials')
      if (credentials !== undefined) return (await credentials.resolve(apiKeyEnv))?.value
      const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv)
      return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
    },
    apiKeyEnv,
    baseURL: config.baseURL
      ?? launchEnvironmentOf(ctx).get(SEARCH_BASE_URL_ENV)?.value
      ?? DEEPSEEK_DEFAULT_BASE_URL,
    model: config.model ?? DEEPSEEK_DEFAULT_MODEL,
    apiVersion: config.apiVersion ?? DEEPSEEK_DEFAULT_API_VERSION,
    maxTokens: config.maxTokens ?? DEEPSEEK_DEFAULT_MAX_TOKENS,
    maxUses: config.maxUses ?? DEEPSEEK_DEFAULT_MAX_USES,
    recordRequest: (request) => {
      ctx.get('agents')?.currentInitiator()?.session.append(
        'web/deepseek-search-llm-request',
        request,
      )
    },
  }
}

export function apply(ctx, config) {
  let source = () => sectionOf(config)
  let options = resolveOptions(ctx, { ...config, ...definedOf(source()) })
  ctx.web.registerSearchProvider(new DeepSeekSearchProvider(() => options))

  installSettingsSection(ctx, WEB_SEARCH_SETTINGS_NAMESPACE, WebSearchSettings, sectionOf(config), {
    setSource: (next) => { source = next },
    onChange: () => { options = resolveOptions(ctx, { ...config, ...definedOf(source()) }) },
  })
}
