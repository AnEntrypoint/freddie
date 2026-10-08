const PACKAGE_NAME = '@freddie/freddie-tool-goal'

export const name = 'tool-goal-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
