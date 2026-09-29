const PACKAGE_NAME = '@freddie/freddie-client-ui-observability'

export const name = 'client-ui-observability-invariant'
export const inject = ['invariants']

const installNoRuntimeInvariant = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, installNoRuntimeInvariant))
