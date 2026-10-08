const PACKAGE_NAME = '@freddie/freddie-session-turn-outline'

export const name = 'session-turn-outline-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
