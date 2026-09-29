const PACKAGE_NAME = '@freddie/freddie-api-settings-controller'

export const name = 'api-settings-controller-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
