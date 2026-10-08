const PACKAGE_NAME = '@freddie/freddie-output-retention'

export const name = 'output-retention-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
