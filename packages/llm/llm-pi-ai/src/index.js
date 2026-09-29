/**
 * Generic pi-ai-backed LLM adapter plugin. One plugin instance owns a dict of
 * provider routes; a route naming an installed pi-ai provider inherits that
 * provider's endpoint, protocol, and model catalog as defaults, and a route
 * pi-ai does not ship is declared outright. Profile facts resolve per request
 * over the optional `llm-pi-ai` user-settings section and the optional
 * credential seam, so a changed key, endpoint, model, or knob reaches the next
 * request without a restart; a changed *route set* (or a route's
 * registration-captured retry policy) re-registers the same adapter instance
 * in place.
 *
 * ```yaml
 * - id: llm
 *   name: '@freddie/freddie-llm-pi-ai'
 *   config:
 *     providers:
 *       # Catalog route: everything but the credential comes from pi-ai.
 *       openai:
 *         apiKeyEnv: OPENAI_API_KEY
 *         retryPolicy:
 *           mode: normal
 *           maxRetries: 2
 *       # Catalog route with the catalog narrowed and one capacity corrected.
 *       anthropic:
 *         apiKeyEnv: ANTHROPIC_API_KEY
 *         models:
 *           - id: claude-sonnet-4-5
 *             contextWindow: 200000
 *       # Hand-declared route: pi-ai ships nothing under this key.
 *       acme-gateway:
 *         displayName: Acme Gateway
 *         apiKeyEnv: ACME_GATEWAY_API_KEY
 *         api: openai-completions
 *         baseURL: https://gateway.acme.example/v1
 *         # Reasoning dialect for a URL pi-ai cannot recognize.
 *         compat:
 *           thinkingFormat: deepseek
 *         models:
 *           - id: acme-large
 *             name: Acme Large
 *             contextWindow: 65536
 *             maxTokens: 4096
 *           - id: acme-think
 *             name: Acme Think
 *             contextWindow: 262144
 *             maxTokens: 32768
 *             # key = selectable level, value = wire spelling; only off may
 *             # leave the value empty (supported, send nothing).
 *             reasoningEfforts:
 *               off:
 *               high: high
 *               max: ultra
 * ```
 * @module @freddie/freddie-llm-pi-ai
 */

import { assertUsableApiKey, LlmError } from '@freddie/freddie-llm'
import { launchEnvironmentOf } from '@freddie/freddie-launch-environment'
import { deepEqualJson, installSettingsSection, settingsNamespace } from '@freddie/freddie-settings'
import { PiAiAdapter } from './adapter.js'
import { authContextFrom, credentialStoreFrom, recordKeyFor } from './auth.js'
import { catalogProviderIds } from './catalog.js'
import { assertServiceable, Config, resolveProfiles } from './config.js'
import { discoverModels } from './discovery.js'
import { registerPiAiFlows } from './login.js'
import { supportedProtocols } from './provider.js'

export { PiAiAdapter } from './adapter.js'
export { Config } from './config.js'
export { recordKeyFor } from './auth.js'
export { supportedProtocols } from './provider.js'

export const name = 'llm-pi-ai'
export const inject = ['llm']

const NS = settingsNamespace('llm-pi-ai')

/**
 * The registry captures these per route; a change here must re-register.
 * Sorted by provider so a settings document that merely reorders its keys is
 * not mistaken for a route change.
 * @param {ReadonlyMap<string, object>} profiles - the resolved profiles.
 * @returns {unknown} the comparable registration facts.
 */
function registrationFacts(profiles) {
  return [...profiles.entries()]
    .map(([provider, profile]) => ({
      provider,
      displayName: profile.displayName,
      retryPolicy: profile.retryPolicy,
    }))
    .sort((left, right) => left.provider.localeCompare(right.provider))
}

/**
 * The configurable-provider directory: every installed catalog route, plus
 * every route the current profiles declare. A hand-declared route has no
 * catalog entry, so without this union it would have no settings address and
 * configuration surfaces could neither show nor edit it.
 * @param {ReadonlyMap<string, object>} profiles - the currently resolved provider profiles.
 * @returns {object[]} the directory entries in catalog order, declared routes last.
 */
function directoryEntries(profiles) {
  const catalog = new Set(catalogProviderIds())
  const entries = new Map()
  const declare = (provider, displayName) => {
    const absentFromInstalledCatalog = !catalog.has(provider)
    entries.set(provider, {
      provider,
      displayName,
      settingsNs: NS,
      settingsPath: ['providers', provider],
      declared: absentFromInstalledCatalog,
    })
  }
  for (const provider of catalog) declare(provider, provider)
  for (const [provider, profile] of profiles) declare(provider, profile.displayName)
  return [...entries.values()]
}

/** Register one generic pi-ai adapter for all configured provider routes. */
export function apply(ctx, config) {
  let current = () => config
  let lastRaw
  let memoized
  /**
   * The resolved profiles for the current configuration, memoized by the raw
   * snapshot's shape — which is also what makes the adapter's own snapshot
   * stable across operations that observe no change. The settings scope hands
   * back a fresh object per read, so identity alone cannot recognize an
   * unchanged section; the resolved map's identity is what the adapter keys its
   * collection on, so a deep-equal snapshot must return the same one.
   *
   * Catalog diagnostics stay in the snapshot beside serviceable models, so
   * stored configuration remains visible after an installed catalog changes.
   * Scalar configuration errors still reject resolution.
   * @returns {ReadonlyMap<string, object>} the resolved profiles.
   */
  const profiles = () => {
    const raw = structuredClone(current())
    if (memoized !== undefined && deepEqualJson(raw, lastRaw)) return memoized
    const next = resolveProfiles(raw.providers ?? {}, 'deferred')
    lastRaw = raw
    memoized = next
    return next
  }
  profiles()

  const lookupCredentialValue = async (ref) => {
    const credentials = ctx.get('credentials')
    if (credentials === undefined) return launchEnvironmentOf(ctx).get(ref)?.value
    return (await credentials.resolve(ref))?.value
  }

  const resolveApiKey = async (provider, profile) => {
    const ref = profile.apiKeyEnv
    if (ref === undefined) return undefined
    const hit = await lookupCredentialValue(ref)
    if (hit !== undefined && hit.length > 0) return assertUsableApiKey(hit, 'llm-pi-ai', ref)
    throw new LlmError(
      `llm-pi-ai: no credential for provider route "${provider}"; its profile resolves ${ref}, which is not`
      + ` set — store ${ref} through the credentials service (the web Models page writes it) or export it,`
      + ' and remove apiKeyEnv only if this provider should authenticate from pi-ai\'s own environment discovery',
      'MISSING_CREDENTIAL',
    )
  }

  const auth ={ credentials: credentialStoreFrom(ctx), authContext: authContextFrom(ctx) }
  const adapter = new PiAiAdapter({
    profiles,
    resolveApiKey,
    auth,
    resolveAttachments: () => ctx.get('attachments'),
    onReplayDegrade: ({ provider, model, reason }) => {
      ctx.logger.warn(
        `llm-pi-ai: unusable replay state on assistant history for route "${provider}/${model}";`
        + ` sending that message as provider-neutral content (${reason})`,
      )
    },
  })
  ctx.inject(['authorization'], (authorized) => { registerPiAiFlows(authorized, auth) })

  let directory
  let directoryFacts
  const ensureDirectory = () => {
    const entries = directoryEntries(profiles())
    if (deepEqualJson(entries, directoryFacts)) return
    if (directory === undefined) {
      directory = ctx.llm.registerConfigurableProviders(entries)
    } else {
      directory.replace(entries)
    }
    directoryFacts = entries
  }
  ensureDirectory()

  /**
   * Host-owned request inputs for discovery of one configured route.
   * @param {string | undefined} provider - the route being edited.
   * @returns {object | undefined} its stored headers and lazy credential resolution.
   */
  const storedDiscoveryProfile = (provider) => {
    if (provider === undefined) return undefined
    const profile = profiles().get(provider)
    if (profile === undefined) return undefined
    return {
      headers: profile.headers,
      resolveApiKey: () => resolveApiKey(provider, profile),
    }
  }
  ctx.llm.registerModelDiscovery(
    NS,
    request => discoverModels(request, () => storedDiscoveryProfile(request.provider)),
  )

  let registration
  let registeredFacts
  const ensureRegistrationFacts = () => {
    const facts = registrationFacts(profiles())
    if (deepEqualJson(facts, registeredFacts)) return
    const routes = [...profiles().keys()]
    if (registration === undefined) {
      const dormantBareMount = routes.length === 0
      if (dormantBareMount) {
        registeredFacts = facts
        return
      }
      registration = ctx.llm.registerAdapter(routes, adapter)
    } else {
      registration.replace(routes)
    }
    registeredFacts = facts
  }
  ensureRegistrationFacts()

  const onChange = () => {
    try {
      ensureRegistrationFacts()
      ensureDirectory()
    } catch (error) {
      ctx.logger.error('llm-pi-ai: configuration conflicts with an existing provider route')
      ctx.logger.error(error)
    }
  }

  installSettingsSection(ctx, NS, Config, config, {
    setSource: (source) => { current = source },
    onChange,
    validate: (value) => {
      assertServiceable(
        { providers: structuredClone(value?.providers ?? {}) },
        { providers: structuredClone(current()?.providers ?? {}) },
      )
    },
  })
}
