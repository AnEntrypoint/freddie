/**
 * Register a DeepSeek-backed provider in `ctx.web`. It calls the Anthropic-compatible Messages API
 * with native `web_search_20250305`. The provider reuses `DEEPSEEK_API_KEY` but not
 * `DEEPSEEK_BASE_URL`; auxiliary search has its own endpoint configuration.
 *
 * A function/namespace plugin (NOT a default-export service): a search provider does not own the
 * `ctx.web` key — it registers INTO the seam's provider registry, exactly as
 * `@freddie/freddie-llm-deepseek` registers an adapter into `ctx.llm` and
 * `@freddie/freddie-web-search-exa` registers its own provider. The key is owned by `@freddie/freddie-web`.
 */
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

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-deepseek'

/** The web seam this provider registers into. */
export const inject = ['web']

const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'

/**
 * Auxiliary-search endpoint, independent of the conversation adapter's
 * `$DEEPSEEK_BASE_URL` and selected protocol.
 */
const SEARCH_BASE_URL_ENV = 'DEEPSEEK_SEARCH_BASE_URL'

/** The settings namespace this provider's own configuration is edited through. */
export const WEB_SEARCH_SETTINGS_NS = 'web-search-deepseek'

/** The namespace, branded the way the settings service addresses one. */
export const WEB_SEARCH_SETTINGS_NAMESPACE = settingsNamespace(WEB_SEARCH_SETTINGS_NS)

/**
 * The section this provider serves, deliberately narrower than {@link Config}:
 * `apiKey` is absent from it, so a literal key has no path into the settings
 * document and travels only through the credentials domain.
 */
export const WebSearchSettings = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: z.string(),
  maxUses: z.number().step(1).min(1).default(DEEPSEEK_DEFAULT_MAX_USES),
})

/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export const Config = z.object({
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: z.string(),
  model: z.string().default(DEEPSEEK_DEFAULT_MODEL),
  apiVersion: z.string().default(DEEPSEEK_DEFAULT_API_VERSION),
  maxTokens: z.number().step(1).min(1).default(DEEPSEEK_DEFAULT_MAX_TOKENS),
  maxUses: z.number().step(1).min(1).default(DEEPSEEK_DEFAULT_MAX_USES),
})

/**
 * Project a composition entry onto the section this provider serves. Keys the
 * entry leaves unset stay unset rather than resolving to `undefined`, so the
 * schema's own defaults and the environment remain what supply them.
 * @param {object} config - the resolved plugin configuration.
 * @returns {object} the section-shaped base layer.
 */
function sectionOf(config) {
  return {
    apiKeyEnv: config.apiKeyEnv ?? DEFAULT_API_KEY_ENV,
    ...config.baseURL === undefined ? {} : { baseURL: config.baseURL },
    maxUses: config.maxUses ?? DEEPSEEK_DEFAULT_MAX_USES,
  }
}

/** Drop keys a resolved section answered with nothing, so a merge cannot erase a layer beneath. */
function definedOf(section) {
  return Object.fromEntries(Object.entries(section ?? {}).filter(([, value]) => value !== undefined))
}

/**
 * Project the plugin's resolved config into the options the provider serves its next search
 * with. Re-resolved whenever the `web-search-deepseek` section changes, so an
 * edit made from the settings surface reaches the next search instead of the
 * next composition reload.
 * @param {import('@freddie/cordis').Context} ctx - plugin context supplying the credential and environment planes.
 * @param {object} config - the resolved plugin configuration.
 * @returns {import('./provider.js').DeepSeekSearchProviderOptions} options for one search.
 */
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

/**
 * Register the DeepSeek search provider with `ctx.web`.
 *
 * The options the provider serves come from a thunk it calls per search, so
 * re-resolving them on a settings commit is what makes an edit to this
 * namespace take effect without recomposing: the section is the source, and the
 * composition entry is only what it resolves over.
 * @param {import('@freddie/cordis').Context} ctx
 * @param {object} config
 */
export function apply(ctx, config) {
  let source = () => sectionOf(config)
  let options = resolveOptions(ctx, { ...config, ...definedOf(source()) })
  ctx.web.registerSearchProvider(new DeepSeekSearchProvider(() => options))

  installSettingsSection(ctx, WEB_SEARCH_SETTINGS_NAMESPACE, WebSearchSettings, sectionOf(config), {
    setSource: (next) => { source = next },
    onChange: () => { options = resolveOptions(ctx, { ...config, ...definedOf(source()) }) },
  })
}
