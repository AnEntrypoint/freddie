const PACKAGE_NAME = '@freddie/freddie-fs-local'

export const name = 'fs-local-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
