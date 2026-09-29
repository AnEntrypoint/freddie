
export class SessionProvideChannel {
  providers = []
  maybeInfoCache
  currentSnapshot
  listeners = new Set()

  constructor(host) {
    this.host = host
    this.providers.push({
      hooks: ['session'],
      resolve: binding => ({ hooks: { session: binding.session } }),
    })
    this.maybeInfoCache = this.materializeMaybeInfo()
    this.currentSnapshot = this.maybeInfoCache
    this.currentProvideInfo = {
      getSnapshot: () => this.currentSnapshot,
      subscribe: (fn) => {
        this.listeners.add(fn)
        return () => { this.listeners.delete(fn) }
      },
    }
  }

  get maybeInfo() {
    return this.maybeInfoCache
  }

  provide(descriptor) {
    this.providers.push(descriptor)
    try {
      this.applyRosterChange()
    } catch (error) {
      this.providers.splice(this.providers.indexOf(descriptor), 1)
      this.applyRosterChange()
      throw error
    }
    return () => {
      const at = this.providers.indexOf(descriptor)
      if (at >= 0) this.providers.splice(at, 1)
      this.applyRosterChange()
    }
  }

  publishCurrent() {
    const next = this.host.resolveCurrent()
    if (next === this.currentSnapshot) return
    this.currentSnapshot = next
    for (const fn of [...this.listeners]) {
      try {
        fn()
      } catch (error) {
        console.error('sessions.currentProvideInfo subscriber failed:', error)
      }
    }
  }

  materializeInfo(binding) {
    const hooks = {}
    const props = {}
    for (const descriptor of this.providers) {
      const contribution = descriptor.resolve(binding)
      const contributedHooks = contribution.hooks ?? {}
      const contributedProps = contribution.props ?? {}
      for (const name of Object.keys(contributedHooks)) {
        if (!(descriptor.hooks ?? []).includes(name)) {
          throw new Error(`sessions.provide: undeclared hook "${name}"`)
        }
      }
      for (const name of Object.keys(contributedProps)) {
        if (!(descriptor.props ?? []).includes(name)) {
          throw new Error(`sessions.provide: undeclared prop "${name}"`)
        }
      }
      for (const name of descriptor.hooks ?? []) {
        const source = contributedHooks[name]
        if (source === undefined) throw new Error(`sessions.provide: missing hook "${name}"`)
        if (Object.hasOwn(hooks, name)) throw new Error(`sessions.provide: duplicate hook "${name}"`)
        hooks[name] = source
      }
      for (const name of descriptor.props ?? []) {
        if (!Object.hasOwn(contributedProps, name)) throw new Error(`sessions.provide: missing prop "${name}"`)
        if (Object.hasOwn(props, name)) throw new Error(`sessions.provide: duplicate prop "${name}"`)
        props[name] = contributedProps[name]
      }
    }
    return {
      sessionId: binding.sessionId,
      hooks,
      props,
      projections: { faceOf: key => binding.session.projections.faceOf(key) },
    }
  }

  applyRosterChange() {
    this.maybeInfoCache = this.materializeMaybeInfo()
    this.host.rebuildBundles()
    this.publishCurrent()
  }

  materializeMaybeInfo() {
    const hooks = {}
    const props = {}
    for (const descriptor of this.providers) {
      for (const name of descriptor.hooks ?? []) {
        if (Object.hasOwn(hooks, name)) throw new Error(`sessions.provide: duplicate hook "${name}"`)
        hooks[name] = undefined
      }
      for (const name of descriptor.props ?? []) {
        if (Object.hasOwn(props, name)) throw new Error(`sessions.provide: duplicate prop "${name}"`)
        props[name] = undefined
      }
    }
    return { sessionId: undefined, hooks, props }
  }
}
