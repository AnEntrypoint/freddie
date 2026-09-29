const PACKAGE_NAME = '@freddie/freddie-gm-client'

export const name = 'gm-client-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
