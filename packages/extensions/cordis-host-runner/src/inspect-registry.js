import { Service } from '@freddie/cordis'
import { snapshotJsonValue } from '@freddie/freddie-session'
import { assertSupportedJsonSchema, validateJsonSchemaValue } from '@freddie/freddie-tools'

export class CordisInspectRegistryService extends Service {
  providers = new Map()
  sharedProviders = new Map()
  pending = new Map()
  clientManifest
  nextRequest = 1

  constructor(ctx) {
    super(ctx, 'cordisInspect')
  }

  register(registration) {
    const manifest = validateManifest(registration.manifest)
    if (this.providers.has(manifest.id)) throw new Error(`Host Cordis inspect provider "${manifest.id}" is already registered`)
    const stored = { ...registration, manifest }
    this.providers.set(manifest.id, stored)
    return () => {
      if (this.providers.get(manifest.id) === stored) this.providers.delete(manifest.id)
    }
  }

  registerShared(registration) {
    const manifest = validateManifest(registration.manifest)
    const existing = this.providers.get(manifest.id)
    if (existing === undefined) {
      const release = this.register(registration)
      this.sharedProviders.set(manifest.id, { manifest, count: 1, release })
      return () => { this.releaseShared(manifest.id) }
    }
    const shared = this.sharedProviders.get(manifest.id)
    if (shared === undefined || !sameManifest(shared.manifest, manifest)) {
      throw new Error(`Host Cordis inspect provider "${manifest.id}" is already registered`)
    }
    shared.count += 1
    return () => { this.releaseShared(manifest.id) }
  }

  releaseShared(id) {
    const shared = this.sharedProviders.get(id)
    if (shared === undefined) return
    shared.count -= 1
    if (shared.count > 0) return
    this.sharedProviders.delete(id)
    shared.release()
  }

  syncClientManifest(providers) {
    const ids = new Set()
    const validated = providers.map((provider) => {
      const manifest = validateManifest(provider)
      if (ids.has(manifest.id)) throw new Error(`Client Cordis inspect manifest repeats provider "${manifest.id}"`)
      ids.add(manifest.id)
      return manifest
    })
    this.clientManifest = Object.freeze(validated)
  }

  list() {
    return [
      ...[...this.providers.values()].map(provider => view('host', provider.manifest)),
      ...(this.clientManifest ?? []).map(provider => view('client', provider)),
    ]
  }

  async query(platform, providerId, methodName, input, agent, signal) {
    if (platform === 'host') {
      const registration = this.providers.get(providerId)
      if (registration === undefined) throw new Error(`Host Cordis inspect provider "${providerId}" is not registered`)
      const method = findMethod(registration.manifest, methodName)
      validateInput('Host', providerId, method, input)
      signal.throwIfAborted()
      const data = await registration.query(methodName, input, { agent, signal })
      signal.throwIfAborted()
      return validateOutput('Host', providerId, method, data)
    }
    return await this.queryClient(providerId, methodName, input, agent, signal)
  }

  resolveClientQuery(agent, requestId, resolution) {
    const pending = this.pending.get(requestId)
    if (pending === undefined || pending.request.agentId !== agent.id) return { accepted: false }
    if (!resolution.ok) return { accepted: false }
    try {
      resolution = {
        ok: true,
        data: validateOutput('Client', pending.request.provider, pending.method, resolution.data),
      }
    } catch {
      return { accepted: false }
    }
    this.pending.delete(requestId)
    pending.settle(resolution)
    this.ctx.emit('cordis/inspect-query-resolved', { requestId })
    return { accepted: true }
  }

  async queryClient(providerId, methodName, input, agent, signal) {
    const provider = this.clientManifest?.find(candidate => candidate.id === providerId)
    if (provider === undefined) throw new Error(`Client Cordis inspect provider "${providerId}" is not registered`)
    const method = findMethod(provider, methodName)
    validateInput('Client', providerId, method, input)
    signal.throwIfAborted()
    const requestId = `inspect-${this.nextRequest++}`
    const request = {
      requestId,
      agentId: agent.id,
      provider: providerId,
      method: methodName,
      ...input === undefined ? {} : { input },
    }
    const result = new Promise((resolve) => {
      this.pending.set(requestId, { request, method, settle: resolve })
    })
    const onAbort = () => {
      const pending = this.pending.get(requestId)
      if (pending === undefined) return
      this.pending.delete(requestId)
      pending.settle({ ok: false, reason: 'cancelled', message: `Client inspect query ${providerId}.${methodName} was cancelled` })
      this.ctx.emit('cordis/inspect-query-resolved', { requestId })
    }
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
    else this.ctx.emit('cordis/inspect-query', request)
    try {
      const resolution = await result
      if (!resolution.ok) throw new Error(`${providerId}.${methodName}: ${resolution.message}`)
      return resolution.data
    } finally {
      signal.removeEventListener('abort', onAbort)
    }
  }
}

function sameManifest(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function view(platform, manifest) {
  return { platform, ...manifest, methods: [...manifest.methods] }
}

function validateManifest(manifest) {
  if (manifest.id.trim() === '') throw new Error('Cordis inspect provider id must not be empty')
  if (manifest.description.trim() === '') throw new Error(`Cordis inspect provider "${manifest.id}" needs a description`)
  const names = new Set()
  const methods = manifest.methods.map((method) => {
    if (method.name.trim() === '') throw new Error(`Cordis inspect provider "${manifest.id}" has an empty method name`)
    if (names.has(method.name)) throw new Error(`Cordis inspect provider "${manifest.id}" repeats method "${method.name}"`)
    if (method.description.trim() === '') throw new Error(`Cordis inspect method ${manifest.id}.${method.name} needs a description`)
    assertSupportedJsonSchema(method.inputSchema)
    assertSupportedJsonSchema(method.outputSchema)
    names.add(method.name)
    return Object.freeze({ ...method })
  })
  return Object.freeze({ ...manifest, methods: Object.freeze(methods) })
}

function findMethod(manifest, name) {
  const method = manifest.methods.find(candidate => candidate.name === name)
  if (method === undefined) throw new Error(`Cordis inspect provider "${manifest.id}" has no method "${name}"`)
  return method
}

function validateInput(platform, provider, method, input) {
  const violations = validateJsonSchemaValue(method.inputSchema, input ?? {}, 'input')
  if (violations.length > 0) throw new Error(`${platform} Cordis inspect ${provider}.${method.name} rejected input: ${violations.join('; ')}`)
}

function validateOutput(platform, provider, method, data) {
  const snapshot = snapshotJsonValue(data)
  if (snapshot === undefined) throw new Error(`${platform} Cordis inspect ${provider}.${method.name} returned a non-JSON value`)
  const violations = validateJsonSchemaValue(method.outputSchema, snapshot, 'output')
  if (violations.length > 0) throw new Error(`${platform} Cordis inspect ${provider}.${method.name} returned invalid output: ${violations.join('; ')}`)
  return snapshot
}
