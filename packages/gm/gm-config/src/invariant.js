const PACKAGE_NAME = '@freddie/freddie-gm-config'

export const name = 'gm-config-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
