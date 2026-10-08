const PACKAGE_NAME = '@freddie/freddie-cordis-client-runner'

export const name = 'cordis-client-runner-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
