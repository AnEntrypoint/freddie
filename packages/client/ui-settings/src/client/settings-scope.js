import { Service } from '@freddie/cordis'
import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'
import { SettingsDescribeMirror } from './settings-mirror.js'

export class SettingsScopeController {
  tail = Promise.resolve()
  writeGeneration = 0
  disposed = false
  unsubscribe
  pendingRevision

  constructor(api, spec, mirror, persistence, schema) {
    this.api = api
    this.spec = spec
    this.mirror = mirror
    this.persistence = persistence
    this.schema = schema
    this.store = createSnapshotStore({
      status: persistence === 'host' ? 'loading' : 'unavailable',
      value: undefined,
      base: undefined,
      user: undefined,
      revision: undefined,
      writable: false,
      mode: persistence,
    })
    if (persistence === 'host') {
      this.unsubscribe = mirror.subscribe(() => { this.derive() })
      this.derive()
    }
  }

  getSnapshot() {
    return this.store.getSnapshot()
  }

  subscribe(listener) {
    return this.store.subscribe(listener)
  }

  set(field, value) {
    return this.write({ op: 'set', path: [field], value })
  }

  unset(field) {
    return this.write({ op: 'unset', path: [field] })
  }

  write(op) {
    const generation = ++this.writeGeneration
    return this.enqueue(async () => {
      const revision = this.pendingRevision ?? this.getSnapshot().revision
      let response
      try {
        response = await this.api.settings.mutate({
          ns: this.spec.namespace,
          ops: [op],
          ...(revision === undefined ? {} : { expectedRevision: revision }),
        })
      } catch (_settingsWriteFailure) {
        await this.recover(generation)
        return
      }
      if (!response.result.ok) {
        await this.recover(generation)
        return
      }
      if (this.disposed) return
      if (generation === this.writeGeneration) {
        this.pendingRevision = undefined
        this.mirror.acceptView(response.result.value)
      } else {
        this.pendingRevision = response.result.value.revision
      }
    })
  }

  async recover(generation) {
    if (this.disposed || generation !== this.writeGeneration) return
    this.pendingRevision = undefined
    await this.mirror.load()
  }

  async dispose() {
    this.disposed = true
    this.writeGeneration += 1
    this.unsubscribe?.()
    await this.tail
  }

  enqueue(operation) {
    if (this.persistence === 'memory' || this.disposed) return Promise.resolve()
    const task = this.tail.then(async () => {
      if (this.disposed) return
      await operation()
    })
    this.tail = task.catch(() => {})
    return task
  }

  derive() {
    if (this.disposed) return
    const mirrored = this.mirror.getSnapshot()
    if (mirrored.view === undefined) return
    const { writable } = mirrored.view
    const view = mirrored.view.namespaces.find(candidate => candidate.ns === this.spec.namespace)
    if (view === undefined) {
      this.store.update((draft) => {
        draft.status = 'unavailable'
        draft.writable = writable
      })
      return
    }
    const decoded = this.decode(view)
    this.store.update((draft) => {
      draft.revision = view.revision
      draft.base = view.base
      draft.user = view.user
      draft.writable = writable
      if (decoded === undefined) return
      draft.status = 'ready'
      draft.value = decoded
    })
  }

  decode(view) {
    if (this.spec.decode !== undefined) return this.spec.decode(view.value)
    if (typeof view.value !== 'object' || view.value === null || Array.isArray(view.value)) return undefined
    let failure
    try {
      failure = this.schema.validate(this.schema.rehydrate(view.schema), view.value)
    } catch (_malformedSchemaEnvelope) {
      return undefined
    }
    return failure === undefined ? view.value : undefined
  }
}

export class SettingsScopeBinder extends Service {
  constructor(ctx, config) {
    super(ctx, 'settingsScope')
    this.mirror = config.mirror
    this.schema = config.schema
  }

  describe() {
    return this.mirror
  }

  bind(spec) {
    const ctx = this.ctx
    const connection = ctx.get('connection')
    const controller = new SettingsScopeController(
      connection.api,
      spec,
      this.mirror,
      connection.isLoopback ? 'host' : 'memory',
      this.schema,
    )
    ctx.effect(() => {
      void this.mirror.ensure()
      return async () => {
        await controller.dispose()
      }
    }, `ui-settings: ${spec.namespace} settings scope`)
    return controller
  }
}
