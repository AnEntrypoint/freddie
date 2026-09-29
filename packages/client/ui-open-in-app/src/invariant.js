const PACKAGE_NAME = '@freddie/freddie-client-ui-open-in-app'

export const name = 'client-ui-open-in-app-invariant'
export const inject = ['invariants']

const installNoRuntimeInvariant = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, installNoRuntimeInvariant))
