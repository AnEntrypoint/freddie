const PACKAGE_NAME = '@freddie/freddie-session-projection-cache'

export const name = 'session-projection-cache-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
