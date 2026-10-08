const PACKAGE_NAME = '@freddie/freddie-atomic-write'

export const name = 'atomic-write-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
