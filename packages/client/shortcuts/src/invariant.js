const PACKAGE_NAME = '@freddie/freddie-client-shortcuts'

export const name = 'client-shortcuts-invariant'
export const inject = ['invariants']

const installNoRuntimeInvariant = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, installNoRuntimeInvariant))
