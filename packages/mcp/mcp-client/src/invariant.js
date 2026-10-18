const PACKAGE_NAME = '@freddie/freddie-mcp-client'

export const name = 'mcp-client-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
