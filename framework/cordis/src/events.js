import { defineProperty } from '@freddie/cosmokit'
import { Context } from './context.js'
import { DisposableList, symbols } from './utils.js'

export function isBailed(value) {
  return value !== null && value !== false && value !== undefined
}

export class EventsService {
  _hooks = {}
  ctx

  constructor(ctx) {
    this.ctx = ctx
    defineProperty(this, symbols.tracker, {
      property: 'ctx',
      noShadow: true,
    })

    this.on('internal/listener', function (name, listener, options) {
      if (name === 'internal/update' && !options.global) {
        const hooks = this.fiber._hooks['internal/update'] ??= new DisposableList()
        const method = options.prepend ? 'unshift' : 'push'
        return hooks[method](listener)
      }
    })

    this.on('internal/update', function (config, noSave, next) {
      const cbs = [...this._hooks['internal/update'] || []]
      const _next = () => {
        const cb = cbs.shift() ?? next
        return cb.call(this, config, noSave, _next)
      }
      return _next()
    }, { global: true, prepend: true })
  }

  dispatch(type, args) {
    const thisArg = typeof args[0] === 'object' || typeof args[0] === 'function' ? args.shift() : null
    const name = args.shift()
    if (!name.startsWith('internal/')) {
      this.emit('internal/dispatch', type, name, args, thisArg)
    }
    const filter = thisArg?.[Context.filter]
    return (this._hooks[name] || [])
      .filter(hook => hook.global || !filter || filter.call(thisArg, hook.ctx))
      .map(hook => hook.callback.bind(thisArg))
  }

  async parallel(...args) {
    const results = await Promise.allSettled(this.dispatch('emit', args).map(async cb => cb(...args)))
    const errors = results.filter((result) => result.status === 'rejected')
    if (errors.length) throw new AggregateError(errors.map(error => error.reason))
  }

  emit(...args) {
    this.dispatch('emit', args).map(cb => cb(...args))
  }

  async serial(...args) {
    for (const cb of this.dispatch('serial', args)) {
      const result = await cb(...args)
      if (isBailed(result)) return result
    }
  }

  bail(...args) {
    for (const cb of this.dispatch('bail', args)) {
      const result = cb(...args)
      if (isBailed(result)) return result
    }
  }

  waterfall(...args) {
    const cbs = this.dispatch('waterfall', args)
    const inner = args.pop()
    const next = () => {
      const cb = cbs.shift() ?? inner
      return cb(...args)
    }
    args.push(next)
    return next()
  }

  register(label, hooks, callback, options) {
    const method = options.prepend ? 'unshift' : 'push'
    return this.ctx.fiber.effect(() => {
      hooks[method]({ ctx: this.ctx, callback, ...options })
      return () => this.unregister(hooks, callback)
    }, label)
  }

  unregister(hooks, callback) {
    const index = hooks.findIndex(hook => hook.callback === callback)
    if (index >= 0) {
      hooks.splice(index, 1)
      return true
    }
  }

  on(name, listener, options) {
    if (typeof options !== 'object') {
      options = { prepend: options }
    }

    this.ctx.fiber.assertActive()
    listener = this.ctx.reflect.bind(listener)
    const result = this.bail(this.ctx, 'internal/listener', name, listener, options)
    if (result) return result

    const hooks = this._hooks[name] ||= []
    const label = `ctx.on(${typeof name === 'string' ? JSON.stringify(name) : name.toString()})`
    return this.register(label, hooks, listener, options)
  }

  once(name, listener, options) {
    const dispose = this.on(name, function (...args) {
      dispose()
      return listener.apply(this, args)
    }, options)
    return dispose
  }
}
