const PACKAGE_NAME = '@freddie/freddie-experimental-browser-use-runtime'

export const name = 'browser-use-runtime-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
