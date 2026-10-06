const PACKAGE_NAME = '@freddie/freddie-client-vendor-modules'

export const name = 'vendor-modules-invariant'
export const inject = ['invariants']

const installWithoutRuntimeChecks = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, installWithoutRuntimeChecks))
