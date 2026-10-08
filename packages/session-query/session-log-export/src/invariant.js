const PACKAGE_NAME = '@freddie/freddie-session-log-export'

export const name = 'session-export-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
