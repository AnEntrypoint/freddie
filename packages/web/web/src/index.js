import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { WebError } from './types.js'

export {
  WebError,
} from './types.js'

export class WebRuntime extends Service {
  static Config = z.object({
    searchProvider: z.string(),
    fetchProvider: z.string(),
  })

  searchProviders = new Map()
  fetchProviders = new Map()
  searchProviderId
  fetchProviderId

  constructor(ctx, config = {}) {
    super(ctx, 'web')
    this.searchProviderId = config.searchProvider ?? process.env.FREDDIE_WEB_SEARCH_PROVIDER
    this.fetchProviderId = config.fetchProvider ?? process.env.FREDDIE_WEB_FETCH_PROVIDER
  }

  registerSearchProvider(provider) {
    return this.registerProvider(this.searchProviders, provider)
  }

  registerFetchProvider(provider) {
    return this.registerProvider(this.fetchProviders, provider)
  }

  registerProvider(store, provider) {
    if (store.has(provider.id)) {
      throw new WebError(`a web provider with id "${provider.id}" is already registered`, 'WEB_DUPLICATE_PROVIDER')
    }
    const dispose = this.ctx.effect(function* () {
      store.set(provider.id, provider)
      yield () => store.delete(provider.id)
    }, 'web.registerProvider()')
    return () => void dispose()
  }

  async search(request, signal) {
    const provider = resolveProvider({
      providers: this.searchProviders,
      ...this.searchProviderId !== undefined ? { configuredId: this.searchProviderId } : {},
    })
    const result = await provider.search(request, signal)
    return capSources(result, request.maxResults)
  }

  async fetch(request, signal) {
    const provider = resolveProvider({
      providers: this.fetchProviders,
      ...this.fetchProviderId !== undefined ? { configuredId: this.fetchProviderId } : {},
    })
    return provider.fetch(request, signal)
  }
}

function resolveProvider(selection) {
  const { configuredId, providers } = selection
  if (configuredId !== undefined) {
    const provider = providers.get(configuredId)
    if (!provider) {
      throw new WebError(`configured web provider "${configuredId}" is not registered`, 'WEB_PROVIDER_CONFIGURED_MISSING')
    }
    if (!provider.available()) {
      throw new WebError(`configured web provider "${configuredId}" is registered but unavailable`, 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE')
    }
    return provider
  }
  const usable = [...providers.values()].filter(provider => provider.available())
  const [single] = usable
  if (single === undefined) {
    throw new WebError('no usable web provider is registered', 'WEB_PROVIDER_UNAVAILABLE')
  }
  if (usable.length > 1) {
    const ids = usable.map(provider => provider.id).join(', ')
    throw new WebError(`multiple usable web providers are registered (${ids}); configure one explicitly`, 'WEB_PROVIDER_AMBIGUOUS')
  }
  return single
}

function capSources(result, maxResults) {
  if (maxResults === undefined || result.sources.length <= maxResults) return result
  return { ...result, sources: result.sources.slice(0, maxResults), truncated: true }
}

export default WebRuntime
