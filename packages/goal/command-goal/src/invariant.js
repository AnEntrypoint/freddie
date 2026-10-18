const PACKAGE_NAME = '@freddie/freddie-command-goal'

export const name = 'command-goal-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
