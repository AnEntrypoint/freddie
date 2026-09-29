export class ClientCordisInspectRegistry {
  providers = new Map()
  active = new Map()
  publishQueued = false
  syncChain = Promise.resolve()

  constructor(host) {
    this.host = host
  }

  register(registration) {
    const { manifest } = registration
    if (manifest.id.trim() === '') throw new Error('Client Cordis inspect provider id must not be empty')
    if (this.providers.has(manifest.id)) throw new Error(`Client Cordis inspect provider "${manifest.id}" is already registered`)
    const names = new Set()
    for (const method of manifest.methods) {
      if (names.has(method.name)) throw new Error(`Client Cordis inspect provider "${manifest.id}" repeats method "${method.name}"`)
      names.add(method.name)
    }
    this.providers.set(manifest.id, registration)
    this.publish()
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      if (this.providers.get(manifest.id) === registration) {
        this.providers.delete(manifest.id)
        this.publish()
      }
    }
  }

  publish() {
    if (this.publishQueued) return
    this.publishQueued = true
    queueMicrotask(() => {
      this.publishQueued = false
      const manifests = [...this.providers.values()].map(provider => provider.manifest)
      this.syncChain = this.syncChain.then(async () => {
        await this.host.sync(manifests)
      }).catch((error) => {
        console.error('[cordis-client-runner] syncing inspect providers failed:', error)
      })
    })
  }

  async query(request) {
    if (this.active.has(request.requestId)) return
    const controller = new AbortController()
    this.active.set(request.requestId, controller)
    let resolution
    try {
      const provider = this.providers.get(request.provider)
      if (provider === undefined) {
        resolution = { ok: false, reason: 'provider-missing', message: `Client inspect provider "${request.provider}" is unavailable` }
      } else if (!provider.manifest.methods.some(method => method.name === request.method)) {
        resolution = { ok: false, reason: 'method-missing', message: `Client inspect provider "${request.provider}" has no method "${request.method}"` }
      } else {
        const data = await provider.query(request.method, request.input, {
          signal: controller.signal,
          sessionId: request.agentId,
        })
        resolution = controller.signal.aborted
          ? { ok: false, reason: 'cancelled', message: 'Client inspect query was cancelled' }
          : { ok: true, data }
      }
    } catch (error) {
      resolution = controller.signal.aborted
        ? { ok: false, reason: 'cancelled', message: 'Client inspect query was cancelled' }
        : { ok: false, reason: 'provider-error', message: error instanceof Error ? error.message : String(error) }
    } finally {
      this.active.delete(request.requestId)
    }
    if (controller.signal.aborted) return
    await this.host.resolve(request.agentId, request.requestId, resolution)
  }

  close(requestId) {
    this.active.get(requestId)?.abort()
    this.active.delete(requestId)
  }
}

export function provideClientCordisInspect(ctx, registry) {
  ctx.provide('cordisInspect', registry)
}
