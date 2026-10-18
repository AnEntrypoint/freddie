const PACKAGE_NAME = '@freddie/freddie-sdk-jsonrpc-server'

export const name = 'sdk-jsonrpc-server-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
