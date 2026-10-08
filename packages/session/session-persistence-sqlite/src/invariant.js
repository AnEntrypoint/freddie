
const PACKAGE_NAME = '@freddie/freddie-session-persistence-sqlite'

export const name = 'session-persistence-sqlite-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
