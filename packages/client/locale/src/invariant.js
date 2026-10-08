const PACKAGE_NAME = '@freddie/freddie-client-locale'

export const name = 'client-locale-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
