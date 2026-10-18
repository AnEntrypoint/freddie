const PACKAGE_NAME = '@freddie/freddie-client-ui-settings-models'

export const name = 'client-ui-settings-models-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
