const PACKAGE_NAME = '@freddie/freddie-tool-subagent-control'

export const name = 'tool-subagent-control-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
