import { deepEqualJson } from './index.js'

const PACKAGE_NAME = '@freddie/freddie-settings'

export const name = 'settings-invariant'
export const inject = ['invariants']

const install = (ctx, fail) => {
  ctx.on('settings/updated', (ns, next, prev) => {
    const settings = ctx.get('settings')
    if (settings === undefined) {
      fail(`settings/updated for "${ns}" emitted without a live settings service`)
    }
    const current = settings.get(ns)
    if (current === undefined) {
      fail(`settings/updated for "${ns}" emitted while the namespace is unregistered`)
    }
    if (!deepEqualJson(current, next)) {
      fail(`settings/updated for "${ns}" does not match the authoritative resolved value`)
    }
    if (deepEqualJson(next, prev)) {
      fail(`settings/updated for "${ns}" emitted without a resolved-value change`)
    }
  })
}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
