const PACKAGE_NAME = '@freddie/freddie-client-ui-artifacts'

export const name = 'client-ui-artifacts-invariant'
export const inject = ['invariants']

const installNoRuntimeInvariant = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, installNoRuntimeInvariant))
