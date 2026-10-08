const PACKAGE_NAME = '@freddie/freddie-tool-subagent-report'

export const name = 'tool-subagent-report-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
