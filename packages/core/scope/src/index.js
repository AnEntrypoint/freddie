import { Context as CordisContext } from '@freddie/cordis'

export { AnonymousEntries, NamedEntries, ScopedLayers } from './store.js'

const kScope = Symbol.for('freddie.scope')

const carrierKeys = new WeakMap()

const scopeParents = new WeakMap()

function linkScopeParent(key, parent) {
  for (let cursor = parent; cursor !== undefined; cursor = scopeParents.get(cursor)) {
    if (cursor === key) throw new Error('freddie-scope: scope parent link would form a cycle')
  }
  scopeParents.set(key, parent)
}

export function bindScopeParent(key, parent) {
  if (scopeParents.has(key)) {
    throw new Error('freddie-scope: scope key is already bound to a parent; re-linking requires the binding returned by the original bind')
  }
  linkScopeParent(key, parent)
  return {
    rebind(next) {
      linkScopeParent(key, next)
    },
  }
}

export function scopeParentOf(key) {
  return scopeParents.get(key)
}

export function scopeChainOf(key) {
  const chain = []
  for (let cursor = key; cursor !== undefined; cursor = scopeParents.get(cursor)) chain.push(cursor)
  return chain
}

async function quiesceFiber(fiber) {
  await Promise.resolve(fiber.dispose())
  while (fiber.inertia !== undefined) await fiber.inertia
}

function scope() {}

export function createScope(ctx, key, options) {
  if (options?.parent !== undefined) bindScopeParent(key, options.parent)
  const fiber = ctx.plugin(scope)
  const scoped = fiber.ctx.extend({ [kScope]: key })
  let disposing
  return {
    ctx: scoped,
    rawDispose: fiber.dispose,
    dispose: () => (disposing ??= quiesceFiber(fiber)),
  }
}

export function scopeOf(ctx) {
  return ctx[kScope]
}

export function scopeTarget(base, key) {
  const baseFilter = base[CordisContext.filter]
  const carrier = {
    [CordisContext.filter](ctx) {
      if (baseFilter !== undefined && !baseFilter.call(base, ctx)) return false
      const tag = scopeOf(ctx)
      if (tag === undefined) return true
      for (let cursor = key; cursor !== undefined; cursor = scopeParents.get(cursor)) {
        if (cursor === tag) return true
      }
      return false
    },
  }
  carrierKeys.set(carrier, key)
  return carrier
}

export function isScopeCarrier(value) {
  return typeof value === 'object' && value !== null && carrierKeys.has(value)
}

export function carrierKeyOf(value) {
  if (!isScopeCarrier(value)) return undefined
  return carrierKeys.get(value)
}
