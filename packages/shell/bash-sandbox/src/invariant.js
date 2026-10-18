const PACKAGE_NAME = '@freddie/freddie-bash-sandbox'

export const name = 'bash-sandbox-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
