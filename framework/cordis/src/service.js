import { defineProperty } from '@freddie/cosmokit'
import { Context } from './context.js'
import { createCallable, joinPrototype, symbols } from './utils.js'

export class Service {
  static init = symbols.init
  static check = symbols.check
  static config = symbols.config
  static invoke = symbols.invoke
  static extend = symbols.extend
  static tracker = symbols.tracker
  static resolveConfig = symbols.resolveConfig

  name

  ctx

  constructor(ctx, name) {
    name ??= this.constructor['provide']

    let self = this
    const tracker = {
      associate: name,
      property: 'ctx',
    }
    if (self[symbols.invoke]) {
      self = createCallable(name, joinPrototype(Object.getPrototypeOf(this), Function.prototype), tracker)
    }
    self.ctx = ctx
    self.name = name
    defineProperty(self, symbols.tracker, tracker)

    self.ctx.reflect.provide(name, self, this[symbols.check])
    return self
  }

  [symbols.filter](ctx) {
    return ctx[symbols.isolate][this.name] === this.ctx[symbols.isolate][this.name]
  }

  [symbols.extend](props) {
    let self
    if (this[Service.invoke]) {
      self = createCallable(this.name, this, this[symbols.tracker])
    } else {
      self = Object.create(this)
    }
    return Object.assign(self, props)
  }

  [symbols.resolveConfig](base, head) {
    let intercept = this.ctx[Context.intercept]
    const configs = []
    while (this.name in intercept) {
      if (Object.hasOwn(intercept, this.name)) {
        configs.unshift(intercept[this.name])
      }
      intercept = Object.getPrototypeOf(intercept)
    }
    if (base) configs.unshift(base)
    if (head) configs.push(head)
    if (this['Config']?.merge) {
      return this['Config'].merge(...configs)
    } else {
      return Object.assign({}, ...configs)
    }
  }

  static [Symbol.hasInstance](instance) {
    if (!instance) return false
    let constructor = instance.constructor
    while (constructor) {
      constructor = constructor.prototype?.constructor
      if (constructor === this) return true
      constructor &&= Object.getPrototypeOf(constructor)
    }
    return false
  }
}
