const PACKAGE_NAME = '@freddie/freddie-sandbox-windows-acl'

export const name = 'sandbox-windows-acl-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
