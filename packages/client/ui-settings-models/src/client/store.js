import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'

export function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

export function deriveKeyRef(provider) {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}

function apiKeyEnvOf(
  namespace,
  path,
  schema,
) {
  if (namespace === undefined) return undefined
  const profile = schema.getPath(namespace.value, path)
  if (typeof profile !== 'object' || profile === null) return undefined
  const ref = profile.apiKeyEnv
  return typeof ref === 'string' && ref.length > 0 ? ref : undefined
}

export class ModelsSettingsStore {
  store = createSnapshotStore({
    status: 'idle', error: null, credentialError: null, writable: false, rows: [], namespaces: new Map(),
  })

  generation = 0

  constructor(
    api,
    schema,
    describeFace,
  ) {
    this.api = api
    this.schema = schema
    this.describeFace = describeFace
  }

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

export function providerUsable(row) {
  if (!row.entry.active) return false
  if (row.apiKeyEnv === undefined) return true
  return row.credential?.configured === true
}
