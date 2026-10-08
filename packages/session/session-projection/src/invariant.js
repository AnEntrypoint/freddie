const PACKAGE_NAME = '@freddie/freddie-session-projection'

export const name = 'session-projection-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
