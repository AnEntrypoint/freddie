const PACKAGE_NAME = '@freddie/freddie-tool-session-query'

export const name = 'tool-session-query-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
