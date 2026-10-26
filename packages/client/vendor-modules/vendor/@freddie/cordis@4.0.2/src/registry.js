import { defineProperty } from '@freddie/cosmokit'
import { Fiber } from './fiber.js'
import { buildOuterStack, DisposableList, symbols, withProps } from './utils.js'

function isApplicable(object) {
  return object && typeof object === 'object' && typeof object.apply === 'function'
}

export function Inject(name, config) {
  return function (value, decorator) {
    if (decorator.kind === 'class') {
      if (!Object.hasOwn(value, 'inject')) {
        defineProperty(value, 'inject', Object.create(Object.getPrototypeOf(value).inject ?? null))
        defineProperty(value.inject, symbols.checkProto, true)
      }
      value.inject[name] = config
    } else if (decorator.kind === 'method') {
      const inject = (value[symbols.metadata] ??= {}).inject ??= Object.create(null)
      inject[name] = config
      decorator.addInitializer(function () {
        const property = this[symbols.tracker]?.property
        ;(this[symbols.initHooks] ??= []).push(() => {
          this.ctx.inject(inject, (ctx) => {
            return value.call(property ? withProps(this, { [property]: ctx }) : this)
          })
        })
      })
    } else {
      throw new Error('@Inject() can only be used on class or class methods')
    }
  }
}

function resolveInject(inject, result = Object.create(null)) {
  if (!inject) return result
  if (Array.isArray(inject)) {
    for (const name of inject) {
      result[name] = null
    }
  } else if (Reflect.has(inject, symbols.checkProto)) {
    Object.assign(result, resolveInject(Object.getPrototypeOf(inject)))
    for (const name of Object.keys(inject)) {
      result[name] = inject[name] ?? null
    }
  } else {
    for (const name of Object.keys(inject)) {
      result[name] = inject[name] ?? null
    }
  }
  return result
}

Inject.resolve = resolveInject

export class RegistryService {
  _counter = 0
  _internal = new Map()
  ctx

  constructor(ctx) {
    this.ctx = ctx
    defineProperty(this, symbols.tracker, {
      property: 'ctx',
      noShadow: true,
    })
  }

  get counter() {
    return ++this._counter
  }

  get size() {
    return this._internal.size
  }

  resolve(plugin) {
    try {
      if (typeof plugin === 'function') return plugin
      if (isApplicable(plugin)) return plugin.apply
    } catch {}
  }

  get(plugin) {
    const key = this.resolve(plugin)
    return key && this._internal.get(key)
  }

  has(plugin) {
    const key = this.resolve(plugin)
    return !!key && this._internal.has(key)
  }

  delete(plugin) {
    const key = this.resolve(plugin)
    const runtime = key && this._internal.get(key)
    if (!runtime) return
    this._internal.delete(key)
    for (const fiber of runtime.fibers) {
      fiber.dispose()
    }
    return runtime
  }

  keys() {
    return this._internal.keys()
  }

  values() {
    return this._internal.values()
  }

  entries() {
    return this._internal.entries()
  }

  forEach(callback) {
    return this._internal.forEach(callback)
  }

  inject(inject, callback) {
    return this.plugin({ inject, apply: callback, name: callback.name })
  }

  plugin(plugin, config, getOuterStack = buildOuterStack()) {
    const callback = this.resolve(plugin)
    if (!callback) throw new Error('invalid plugin, expect function or object with an "apply" method, received ' + typeof plugin)
    this.ctx.fiber.assertActive()

    let runtime = this._internal.get(callback)
    if (!runtime) {
      let name = plugin.name
      if (name === 'apply') name = undefined
      runtime = { name, callback, fibers: new DisposableList(), Config: plugin.Config }
      this._internal.set(callback, runtime)
    }

    const fiber = new Fiber(this.ctx, config, Inject.resolve(plugin.inject), runtime, getOuterStack)
    const wrapped = Object.create(fiber)
    wrapped.then = (onFulfilled, onRejected) => {
      return fiber.await().then(onFulfilled, onRejected)
    }
    return wrapped
  }
}
