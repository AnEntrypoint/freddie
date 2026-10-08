const PACKAGE_NAME = '@freddie/freddie-host-apiproxy'

export const name = 'host-apiproxy-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
