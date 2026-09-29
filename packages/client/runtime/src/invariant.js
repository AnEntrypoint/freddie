
/* jscpd:ignore-start */

const PACKAGE_NAME = '@freddie/freddie-client-runtime'

export const name = 'client-runtime-invariant'
export const inject = ['invariants']

const install = (ctx, fail) => {
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'slots/changed') return
    const key = args[0]
    if (typeof key !== 'string' || key === '') {
      fail("'slots/changed' dispatched without a slot key argument")
      return
    }
    const slots = ctx.get('slots')
    if (slots !== undefined && slots.getVersion(key) === 0) {
      fail(`'slots/changed' fired for "${key}" before any mutation bumped its version — emission must follow the applied mutation`)
    }
  }, { global: true })
}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
