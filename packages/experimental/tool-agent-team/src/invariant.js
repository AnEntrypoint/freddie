const PACKAGE_NAME = '@freddie/freddie-experimental-tool-agent-team'

export const name = 'tool-team-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
