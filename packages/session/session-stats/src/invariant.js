const PACKAGE_NAME = '@freddie/freddie-session-stats'

export const name = 'session-stats-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
