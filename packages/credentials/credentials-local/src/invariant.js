const PACKAGE_NAME = '@freddie/freddie-credentials-local'

export const name = 'credentials-local-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
