const PACKAGE_NAME = '@freddie/freddie-timeout'

export const name = 'timeout-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
