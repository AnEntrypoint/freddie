const PACKAGE_NAME = '@freddie/freddie-client-css-manifest'

export const name = 'css-manifest-invariant'
export const inject = ['invariants']

const installNoRuntimeInvariant = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, installNoRuntimeInvariant))
