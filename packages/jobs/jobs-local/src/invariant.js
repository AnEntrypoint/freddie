const PACKAGE_NAME = '@freddie/freddie-jobs-local'

export const name = 'jobs-local-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
