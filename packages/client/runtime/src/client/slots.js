import { Service } from '@freddie/cordis'
import { SlotCore } from '@freddie/freddie-client-ui-slots'

const ROOT_INSTANCE_KEY = 'root'

export class SlotRegistry extends Service {
  _core = new SlotCore()
  _stores = new Map()
  _renderer
  _locale
  _host

  constructor(ctx) {
    super(ctx, 'slots')
    this._core.onMutate((key) => { ctx.emit('slots/changed', key) })
  }

  inject(key, callback) {
    const ctx = this.ctx
    const disposeController = ctx.effect(() => {
      let active
      let activeEpoch
      let stopped = false
      let unsubscribe = () => {}

      const stop = () => {
        if (stopped) return
        stopped = true
        unsubscribe()
        const dispose = active
        active = undefined
        activeEpoch = undefined
        dispose?.()
      }

      const reconcile = () => {
        if (stopped) return
        const spec = this._core.specDynamic(key)
        const epoch = this._core.declarationEpoch(key)
        if (active !== undefined && activeEpoch === epoch) return
        const dispose = active
        active = undefined
        activeEpoch = undefined
        dispose?.()
        if (spec === undefined) return
        const disposeEffect = ctx.effect(callback, `slots.inject(${JSON.stringify(key)}): declaration`)
        active = () => { void disposeEffect() }
        activeEpoch = epoch
      }

      const changed = () => {
        try {
          reconcile()
        } catch (error) {
          if (error?.code === 'INACTIVE_EFFECT') {
            stop()
            return
          }
          stop()
          const failure = error instanceof Error ? error : new Error(String(error))
          queueMicrotask(() => { throw failure })
        }
      }

      unsubscribe = this._core.subscribeDeclaration(key, changed)
      try {
        reconcile()
      } catch (error) {
        stop()
        throw error
      }
      return stop
    }, `slots.inject(${JSON.stringify(key)})`)
    return () => { void disposeController() }
  }

  install(renderer) {
    if (this._renderer !== undefined) throw new Error('slot renderer already installed (install() is boot-once)')
    this.ctx.effect(() => {
      this._renderer = renderer
      return () => {
        if (this._renderer === renderer) this._renderer = undefined
      }
    }, 'slots.install()')
  }

  installLocale(face) {
    if (this._locale !== undefined) throw new Error('locale face already installed (installLocale() is boot-once)')
    this.ctx.effect(() => {
      this._locale = face
      return () => {
        if (this._locale === face) this._locale = undefined
      }
    }, 'slots.installLocale()')
  }

  renderSlot(key, owner) {
    if (key !== 'root') {
      throw new Error(`ctx-level renderSlot only renders 'root' (got "${key}"); child slots render through the component props face`)
    }
    if (this._renderer === undefined) {
      throw new Error("slot renderer not installed — boot must call ctx.slots.install(createSlotRenderer()) before rendering 'root'")
    }
    if (this._core.entries('root').length === 0) {
      throw new Error("'root' has no registration — a layout entry must register into 'root' before the shell renders it")
    }
    return this._renderer.renderRoot(this.hostFace(), owner)
  }

  pruneStoreScope(sessionId) {
    for (const [handle, record] of this._stores) {
      if (record.scope !== 'session') continue
      const instance = record.instances.get(sessionId) ?? handle.create(sessionId)
      instance.clearPersisted()
      record.instances.delete(sessionId)
    }
  }

  entries(key) {
    return this._core.entries(key)
  }

  entriesOfSlot(key) {
    return this._core.entriesOfSlot(key)
  }

  snapshot(root) {
    return this._core.snapshot(root)
  }

  onEntryError(fn) {
    return this._core.onEntryError(fn)
  }

  spec(key) {
    return this._core.spec(key)
  }

  subscribe(key, fn) {
    return this._core.subscribe(key, fn)
  }

  getVersion(key) {
    return this._core.getVersion(key)
  }

  _register(options, component) {
    const store = typeof options.store === 'function' ? options.store() : options.store
    const registrant = options.registrant ?? this.ctx.fiber?.name
    const erased = {
      ...options,
      ...(store !== undefined ? { store } : {}),
      ...(registrant !== undefined ? { registrant } : {}),
    }
    const dispose = this._core.register(erased, component)
    if (store !== undefined) {
      const scope = this._core.specDynamic(options.name).scope
      this._acquire(store, scope)
    }
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      dispose()
      if (store !== undefined) this._release(store)
    }
  }

  hostFace() {
    if (this._host !== undefined) return this._host
    const sessions = this.ctx.get('sessions')
    if (sessions === undefined) {
      throw new Error("renderSlot('root') before the sessions service mounted — boot order puts runtime apply first")
    }
    const workspaces = this.ctx.get('workspaces')
    if (workspaces === undefined) {
      throw new Error("renderSlot('root') before the workspaces service mounted — boot order puts runtime apply first")
    }
    const service = this
    this._host = {
      subscribe: (key, fn) => this._core.subscribe(key, fn),
      getVersion: key => this._core.getVersion(key),
      entriesOf: key => this._core.entries(key),
      entriesOfSlot: key => this._core.entriesOfSlot(key),
      reportEntryError: (key, entry, error, info) => { this._core.reportEntryError(key, entry, error, info) },
      specOf: key => this._core.specDynamic(key),
      isLive: entry => this._core.isLive(entry),
      storeOf: (entry, scopeKey) =>
        entry.store === undefined ? undefined : this.resolveStore(entry.store, scopeKey),
      sessions: {
        list: sessions.list,
        provideInfo: sessions.currentProvideInfo,
      },
      workspaces: { list: workspaces.list },
      get locale() { return service._locale },
    }
    return this._host
  }

  resolveStore(handle, sessionId) {
    const record = this._stores.get(handle)
    if (record === undefined) throw new Error('store handle is not registered (entry unloaded, or the handle never went through register)')
    const key = record.scope === 'root' ? ROOT_INSTANCE_KEY : sessionId
    if (key === undefined) throw new Error(`${record.scope} store resolution requires a session id`)
    let instance = record.instances.get(key)
    if (instance === undefined) {
      instance = record.scope === 'root' ? handle.create() : handle.create(key)
      record.instances.set(key, instance)
    }
    return instance
  }

  _acquire(handle, scope) {
    const record = this._stores.get(handle)
    if (record === undefined) {
      this._stores.set(handle, { scope, refs: 1, instances: new Map() })
      return
    }
    record.refs += 1
  }

  _release(handle) {
    const record = this._stores.get(handle)
    /* v8 ignore next */
    if (record === undefined) return
    record.refs -= 1
    if (record.refs === 0) this._stores.delete(handle)
  }
}

SlotRegistry.prototype.register
  = function register(rawOptions, component) {
    const options = rawOptions
    return this.ctx.effect(() => this['_register'](options, component), 'slots.register()')
  }
