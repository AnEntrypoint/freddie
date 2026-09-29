const PACKAGE_NAME = '@freddie/freddie-shell'

export const name = 'shell-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
