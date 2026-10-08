const PACKAGE_NAME = '@freddie/freddie-subagent-spawn-in-process'

export const name = 'subagent-spawn-in-process-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
