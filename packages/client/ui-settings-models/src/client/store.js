/**
 * Models settings page store: one snapshot joining the configurable-provider
 * directory (`llm.providers`), the settings namespaces (shared settings mirror),
 * and the referenced credentials (`credentials.describe`). The host stays the
 * single fact source — every mutation writes through the wire and the page
 * re-renders from the next describe, pushed or refetched.
 */

import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'

/**
 * Human text for a rejected wire call. A transport failure rejects with an
 * Error; a host or a runtime can reject with anything, and the page still has
 * to say something.
 * @param error - the rejection value.
 * @returns the message to show.
 */
export function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Derive the conventional credential reference for a provider route: the v1
 * page never asks for an environment-variable name, so a typed key stores
 * under this derived reference and the profile records it as `apiKeyEnv`.
 * @param provider - provider route id (e.g. `anthropic`, `minimax-cn`).
 * @returns the derived reference name (e.g. `MINIMAX_CN_API_KEY`).
 */
export function deriveKeyRef(provider) {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}

/** The credential reference a resolved profile names (its `apiKeyEnv` field). */
function apiKeyEnvOf(
  namespace,
  path,
  schema,
) {
  if (namespace === undefined) return undefined
  const profile = schema.getPath(namespace.value, path)
  if (typeof profile !== 'object' || profile === null) return undefined
  if (profile.allowUnauthenticated === true) return undefined
  const ref = profile.apiKeyEnv
  return typeof ref === 'string' && ref.length > 0 ? ref : undefined
}

/** The models settings page controller (one per settings surface). */
export class ModelsSettingsStore {
  /** The snapshot the section renders from (uSES-safe store). */
  store = createSnapshotStore({
    status: 'idle', error: null, credentialError: null, writable: false, rows: [], namespaces: new Map(),
  })

  /** Latest load wins; an older response never overwrites a newer one. */
  generation = 0

  /**
   * @param api - the wire face (credentials/llm domains, and settings writes).
   * @param schema - settings schema operations.
   * @param describeFace - the shared mirror's describe face (namespace views and writability).
   */
  constructor(
    api,
    schema,
    describeFace,
  ) {
    this.api = api
    this.schema = schema
    this.describeFace = describeFace
  }

  /**
   * Refresh the whole page snapshot: the provider directory and the mirror's
   * settings answer in parallel, then one batched credential describe over
   * every referenced ref. Provider failure or absence of an initial settings
   * answer keeps the last good rows and surfaces an error; a failed settings
   * refresh reuses the mirror's held view.
   * @returns nothing; the snapshot carries the outcome.
   */
  async load() {
    const generation = ++this.generation
    this.store.update((s) => { s.status = 'loading'; s.error = null })
    let providers
    let writable
    let views
    try {
      const [providersResponse] = await Promise.all([
        this.api.llm.providers({}),
        this.describeFace.ensure(),
      ])
      if (!providersResponse.result.ok) throw new Error(providersResponse.result.error.message)
      const mirrored = this.describeFace.getSnapshot()
      if (mirrored.view === undefined) {
        throw new Error(mirrored.error ?? 'settings are unavailable in this browser')
      }
      providers = providersResponse.result.value.providers
      writable = mirrored.view.writable
      views = mirrored.view.namespaces
    } catch (error) {
      if (generation !== this.generation) return
      this.store.update((s) => {
        s.status = 'error'
        s.error = error instanceof Error ? error.message : String(error)
      })
      return
    }
    const namespaces = new Map(views.map(view => [view.ns, view]))
    const rows = providers.map((entry) => {
      const namespace = namespaces.get(entry.settingsNs)
      const configured = namespace !== undefined
        && (entry.settingsPath.length === 0 || this.schema.getPath(namespace.value, entry.settingsPath) !== undefined)
      const removable = namespace !== undefined
        && entry.settingsPath.length > 0
        && this.schema.hasPath(namespace.user, entry.settingsPath)
        && !this.schema.hasPath(namespace.base, entry.settingsPath)
      return {
        entry,
        configured,
        removable,
        apiKeyEnv: apiKeyEnvOf(namespace, entry.settingsPath, this.schema),
        credential: undefined,
      }
    })
    const refs = [...new Set(rows.flatMap(row => row.apiKeyEnv === undefined ? [] : [row.apiKeyEnv]))]
    let credentials = {}
    let credentialError = null
    if (refs.length > 0) {
      try {
        const response = await this.api.credentials.describe({ refs })
        // Credential state is an enrichment for the Models page: neither a
        // business rejection nor a transport failure fails the load. The
        // onboarding projection below retains the failure distinction.
        if (response.result.ok) credentials = response.result.value.credentials
        else credentialError = response.result.error.message
      } catch (error) {
        credentialError = messageOf(error)
      }
    }
    if (generation !== this.generation) return
    this.store.update((s) => {
      s.status = 'ready'
      s.error = null
      s.credentialError = credentialError
      s.writable = writable
      s.rows = rows.map(row => ({
        ...row,
        ...row.apiKeyEnv !== undefined && credentials[row.apiKeyEnv] !== undefined
          ? { credential: credentials[row.apiKeyEnv] }
          : {},
      }))
      s.namespaces = namespaces
    })
  }
}

/**
 * Whether a joined row can serve model requests as it stands: the route is
 * registered with the adapter registry, and whatever credential its resolved
 * profile names is stored. A profile naming no reference authenticates through
 * the provider's own path (the Bedrock chain, Vertex ADC, a gateway that needs
 * nothing), as does a live route with no settings address at all, so neither
 * owes this page a key.
 * @param row - one joined provider row.
 * @returns whether the user already has this provider to talk to.
 */
export function providerUsable(row) {
  if (!row.entry.active) return false
  if (row.apiKeyEnv === undefined) return true
  return row.credential?.configured === true
}

/**
 * Project first-run readiness from the provider/settings/credential join used
 * by the Models page. The step exists to leave the user with a model to talk
 * to, so ANY usable provider ends it; only when none exists does the official
 * DeepSeek route — the one route the prompt can offer a key field for — decide
 * whether prompting can help. A missing official configurable-provider
 * declaration means the adapter is not repairable by navigating to Models.
 * @param state - current shared Models join snapshot.
 * @returns the onboarding state without reading a parallel fact source.
 */
export function onboardingReadiness(state) {
  if ((state.status === 'idle' || state.status === 'loading') && state.rows.length === 0) {
    return { kind: 'loading' }
  }
  if (state.status === 'error') {
    return {
      kind: 'unavailable',
      reason: 'load-failed',
    }
  }
  if (state.rows.some(providerUsable)) return { kind: 'provider-ready' }
  const row = state.rows.find(candidate =>
    candidate.entry.provider === 'deepseek-official'
    && candidate.entry.settingsNs === 'llm-deepseek'
    && candidate.entry.settingsPath.length === 0)
  if (row === undefined) return { kind: 'adapter-absent' }
  if (!row.entry.active) {
    return {
      kind: 'unavailable',
      reason: 'provider-inactive',
    }
  }
  // Past the usable gate an active route names a reference it has no stored
  // credential for, so the remaining questions are all about that credential.
  if (state.credentialError !== null || row.credential === undefined) {
    return {
      kind: 'unavailable',
      reason: 'credentials-unavailable',
    }
  }
  if (!state.writable) {
    return {
      kind: 'unavailable',
      reason: 'settings-read-only',
    }
  }
  if (!row.credential.writable) {
    return {
      kind: 'unavailable',
      reason: 'credential-read-only',
    }
  }
  return { kind: 'credential-missing' }
}
