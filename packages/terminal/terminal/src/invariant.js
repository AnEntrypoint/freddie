const PACKAGE_NAME = '@freddie/freddie-terminal'

export const name = 'terminal-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
