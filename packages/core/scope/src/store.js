import { scopeChainOf, scopeOf } from './index.js'

export class NamedEntries {
  data = new Map()

  constructor(duplicateError) {
    this.duplicateError = duplicateError
  }

  insert(name, value) {
    const data = this.data
    if (data.has(name)) throw this.duplicateError(name)
    data.set(name, value)
    let active = true
    return () => {
      if (!active) return
      active = false
      data.delete(name)
      if (data.size === 0 && this.data === data) this.data = new Map()
    }
  }

  get(name) {
    return this.data.get(name)
  }

  has(name) {
    return this.data.has(name)
  }

  keys() {
    return this.data.keys()
  }

  entries() {
    return this.data.entries()
  }

  values() {
    return this.data.values()
  }

  isEmpty() {
    return this.data.size === 0
  }
}

export class AnonymousEntries {
  data = new Map()

  append(value) {
    const data = this.data
    const key = Symbol()
    data.set(key, value)
    let active = true
    return () => {
      if (!active) return
      active = false
      data.delete(key)
      if (data.size === 0 && this.data === data) this.data = new Map()
    }
  }

  values() {
    return this.data.values()
  }

  isEmpty() {
    return this.data.size === 0
  }
}

export class ScopedLayers {
  global

  scoped = new Map()

  constructor(createLayer, onChange) {
    this.createLayer = createLayer
    this.onChange = onChange
    this.global = createLayer(undefined)
  }

  peek(scope) {
    if (scope === undefined) return undefined
    return this.scoped.get(scope)
  }

  chainLayers(scope) {
    const layers = []
    for (const key of scopeChainOf(scope).reverse()) {
      const layer = this.scoped.get(key)
      if (layer !== undefined) layers.push(layer)
    }
    return layers
  }

  merge(scope, pick) {
    const merged = new Map(pick(this.global).entries())
    for (const layer of this.chainLayers(scope)) {
      for (const [name, value] of pick(layer).entries()) merged.set(name, value)
    }
    return merged
  }

  effect(ctx, action, options) {
    const scope = scopeOf(ctx)
    const notify = options.notify ?? true
    const dispose = ctx.effect(function* () {
      let layer
      let created = false
      if (scope === undefined) {
        layer = this.global
      } else {
        const existing = this.scoped.get(scope)
        if (existing === undefined) {
          layer = this.createLayer(scope)
          this.scoped.set(scope, layer)
          created = true
        } else {
          layer = existing
        }
      }

      let undo
      try {
        undo = action(layer)
      } catch (error) {
        if (scope !== undefined && created && layer.isEmpty()) this.scoped.delete(scope)
        throw error
      }

      yield () => {
        undo()
        if (scope !== undefined && layer.isEmpty()) this.scoped.delete(scope)
        if (notify) this.onChange()
      }
      if (notify) this.onChange()
    }.bind(this), options.label)
    // oxlint-disable-next-line typescript/no-misused-promises -- exact synchronous disposer preserves Cordis effect identity
    return dispose
  }
}
