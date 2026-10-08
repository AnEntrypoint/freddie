const PACKAGE_NAME = '@freddie/freddie-client-web'

export const name = 'client-web-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
