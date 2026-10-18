const PACKAGE_NAME = '@freddie/freddie-agent-tool-presentation'

export const name = 'tool-presentation-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
