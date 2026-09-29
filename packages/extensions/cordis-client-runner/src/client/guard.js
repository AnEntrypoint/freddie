/**
 * The browser twin of the tool-cordis context facade: a whitelist of
 * lifecycle-safe verbs plus optional `ctx.get()` lookup and declared-service
 * property access, with
 * framework internals withheld and Context-valued returns denied. Two seats
 * carry extra machinery: `slots`, where the register proxy assigns the
 * shadowing priority and ledgers the registration — invoking the service with
 * the traced receiver so the effect lands on the CALLING plugin's fiber
 * (SlotRegistry.register must stay a prototype method for exactly that
 * reason) — and `theme`, whose override source is pinned to the package id.
 *
 * This is API discipline, not a security boundary: a dynamic package's code is
 * as trusted as the host process that accepted its definition.
 */

import { Context } from '@freddie/cordis'

/** Facade verbs beyond declared services (host CTX_VERBS twin). */
const CTX_VERBS = new Set([
  'effect', 'on', 'once', 'provide', 'timeout', 'interval', 'setTimeout', 'setInterval', 'throttle', 'debounce',
])
const TIMER_VERBS = new Set(['timeout', 'interval', 'setTimeout', 'setInterval', 'throttle', 'debounce'])
const STRUCTURAL_SLOTS = new Set(['root', 'sidebar'])

/** Reject any service return that is a cordis Context (host guard twin). */
function denyContext(value, service, env) {
  if (value instanceof Context) {
    return rejectGuard(env,
      `service "${service}" returned a cordis Context, which the dynamic facade does not expose. `
      + 'Operate through your own plugin ctx and the services you declared — never another context.',
    )
  }
  return value
}

/**
 * Forward service methods with the traced service as receiver — `this.ctx`
 * inside prototype methods (slots.register) must stay the CALLER's ctx so
 * effects land on the calling plugin's fiber — while denying Context returns.
 */
function guardedService(service, name, env) {
  return new Proxy(service, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target)
      if (typeof value !== 'function') return denyContext(value, name, env)
      return (...args) => {
        const result = Reflect.apply(value, target, args)
        if (result instanceof Promise) return result.then(resolved => denyContext(resolved, name, env))
        return denyContext(result, name, env)
      }
    },
  })
}

/** The register option that names an entry's cell, per shadowing seat kind (single and chain seats have none). */
const CELL_FIELD = { keyed: 'key', list: 'id' }

/**
 * The entry that already holds the cell a registration names, when a different
 * registrant seated it: built-in entries and other dynamic packages. A package's
 * own earlier entries never count, so it can still re-seat its own cell.
 * @param slots - the traced slots service.
 * @param spec - the target seat's declared spec.
 * @param options - the registration options after guard rewrites.
 * @param env - package row and ownership lookup.
 * @returns the cell field, its value and a description of the holder, or undefined when the cell is free.
 */
function heldCell(slots, spec, options, env) {
  const field = CELL_FIELD[spec?.kind]
  const cell = field === undefined ? undefined : options[field]
  if (cell === undefined) return undefined
  for (const entry of slots.entries(options.name)) {
    if (entry.options[field] !== cell) continue
    const ownerId = env.ownerOf(entry.component)
    if (ownerId === env.pkg.pluginId) continue
    return { field, cell, owner: ownerId === undefined ? 'a built-in entry' : `the dynamic package "${ownerId}"` }
  }
  return undefined
}

/**
 * The slots seat: automatic shadowing priority and ledger recording around the
 * traced service's own register.
 */
function guardedSlots(slots, env) {
  return new Proxy(slots, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target)
      if (prop !== 'register') {
        if (typeof value !== 'function') return denyContext(value, 'slots', env)
        return (...args) => denyContext(Reflect.apply(value, target, args), 'slots', env)
      }
      return (rawOptions, component) => {
        if (typeof rawOptions !== 'object' || rawOptions === null) {
          return rejectGuard(env, 'slots.register(options, component) needs an options object with a `name`')
        }
        const options = { ...rawOptions }
        const slot = options.name
        if (typeof slot !== 'string' || slot.length === 0) {
          return rejectGuard(env, 'slots.register options need a string `name` (the target slot key)')
        }
        if (STRUCTURAL_SLOTS.has(slot)) {
          return rejectGuard(env,
            `slots.register cannot target "${slot}": it is a single slot, so a registration replaces the application frame `
            + '(navigation, Settings, and the plugin panel that can stop this package included). Register into a content seat '
            + 'such as "tool.view.cordis" or "sidebar.footer.action" instead.',
          )
        }
        if (slot === 'tool.view.cordis') {
          if (options.key !== 'self') {
            return rejectGuard(env, 'tool.view.cordis only accepts key "self"; the runtime binds it to this Package')
          }
          options.key = `${env.pkg.pluginId}.${env.pkg.packageId}`
        }
        const spec = slots.spec(slot)
        const held = heldCell(slots, spec, options, env)
        if (held !== undefined) {
          return rejectGuard(env,
            `slots.register into "${slot}" cannot take ${held.field} "${held.cell}": ${held.owner} already holds it, and a registration `
            + `never replaces another registrant's entry. Choose a different ${held.field}; a fresh ${held.field} is added beside the existing entries.`,
          )
        }
        let priority = options.priority
        if (spec === undefined || spec.kind !== 'chain') {
          priority = env.allocatePriority()
          options.priority = priority
        }
        const register = Reflect.get(target, 'register', target)
        const dispose = register.call(target, options, component)
        env.ledger.push({ slot, priority })
        env.claim(component)
        return dispose
      }
    },
  })
}

/**
 * The theme seat: `overrideTokens`' source is FORCED to the package id — a
 * dynamic package can never impersonate (or evict) another source's layer, and
 * its own layers converge under one identity unload can reason about. The
 * layer's disposer is additionally hung on the calling fiber, because the
 * documented contract is "unload restores" and model code cannot be trusted to
 * keep the returned handle (slots parity — register hangs its own cleanup).
 * Everything else forwards through the generic guard.
 */
function guardedTheme(theme, env, ctx) {
  return new Proxy(theme, {
    get(target, prop) {
      if (prop !== 'overrideTokens') {
        const value = Reflect.get(target, prop, target)
        if (typeof value !== 'function') return denyContext(value, 'theme', env)
        return (...args) => {
          const result = Reflect.apply(value, target, args)
          if (result instanceof Promise) return result.then(resolved => denyContext(resolved, 'theme', env))
          return denyContext(result, 'theme', env)
        }
      }
      return (source, tokens) => {
        if (tokens === undefined && typeof source === 'object' && source !== null) {
          return rejectGuard(env,
            'theme.overrideTokens(source, tokens) takes two arguments; source is replaced with your package id, '
            + 'so pass any string first and the token map second: overrideTokens(\'mine\', { \'--freddie-alias-…\': { light: \'…\', dark: \'…\' } })',
          )
        }
        const method = Reflect.get(target, 'overrideTokens', target)
        const dispose = Reflect.apply(method, target, [`${env.pkg.pluginId}.${env.pkg.packageId}`, tokens])
        ctx.effect(() => dispose, 'cordis-client-runner: dynamic theme override layer')
        return dispose
      }
    },
  })
}

/**
 * Build the facade one dynamic plugin's `apply` receives (host sandboxContext
 * twin, browser seats). `ctx.get(name)` performs optional lookup; direct
 * `ctx.serviceName` access is gated by the fiber's `inject` declaration.
 * @param ctx - the plugin's real fiber ctx (loader-created).
 * @param env - package row + ledger sink.
 * @returns the whitelisting proxy standing in for ctx.
 */
export function dynamicCordisContext(ctx, env) {
  const declared = new Set(Object.keys(ctx.fiber.inject))
  const denyRead = (prop) => {
    if (ctx.get(prop) !== undefined) {
      return rejectGuard(env,
        `service "${prop}" is not declared by your plugin. Declare it on the plugin you return: `
        + `{ inject: ['${prop}', …], apply(ctx) { … } } — a plain \`function\` has no declaration site, `
        + 'so use the object form. The runtime then parks the package if the provider unloads.',
      )
    }
    return rejectGuard(env,
      `dynamic ctx does not expose "${prop}". Available: ctx.on / ctx.provide / timer helpers after injecting timer, and any service your `
      + 'returned plugin declared in inject (slots and theme are the usual UI seats). Framework internals are withheld '
      + 'by design.',
    )
  }
  const readService = (name, requireDeclaration) => {
    if (requireDeclaration && !declared.has(name)) return denyRead(name)
    const service = denyContext(ctx.get(name), name, env)
    if (service === null || (typeof service !== 'object' && typeof service !== 'function')) return service
    if (name === 'slots') return guardedSlots(service, env)
    if (name === 'theme') return guardedTheme(service, env, ctx)
    return guardedService(service, name, env)
  }
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === 'get') return name => readService(name, false)
      if (typeof prop !== 'string') return undefined
      if (CTX_VERBS.has(prop)) {
        return (...args) => {
          if (TIMER_VERBS.has(prop) && !declared.has('timer')) return denyRead('timer')
          const method = ctx[prop]
          return Reflect.apply(method, ctx, args)
        }
      }
      return readService(prop, true)
    },
    set(_target, prop) {
      return rejectGuard(env, `dynamic ctx is read-only; cannot assign "${String(prop)}"`)
    },
    has: (_target, prop) => prop === 'get'
      || (typeof prop === 'string'
        && ((CTX_VERBS.has(prop) && (!TIMER_VERBS.has(prop) || declared.has('timer'))) || declared.has(prop))),
  })
}

function rejectGuard(env, message) {
  const error = new Error(message)
  env.reportFailure(error)
  throw error
}
