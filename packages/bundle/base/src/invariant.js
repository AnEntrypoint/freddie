
const PACKAGE_NAME = '@freddie/freddie-base'

export const name = 'base-bundle-invariant'
export const inject = ['invariants']

const installNoRuntimeInvariants = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, installNoRuntimeInvariants))
