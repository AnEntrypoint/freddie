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

function registrationFacts(profiles) {
  return [...profiles.entries()]
    .map(([provider, profile]) => ({
      provider,
      displayName: profile.displayName,
      retryPolicy: profile.retryPolicy,
    }))
    .sort((left, right) => left.provider.localeCompare(right.provider))
}

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

export function apply(ctx, config) {
  let current = () => config
  let lastRaw
  let memoized
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
