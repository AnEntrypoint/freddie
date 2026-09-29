const PACKAGE_NAME = '@freddie/freddie-agent-default-model'

export const name = 'agent-default-model-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
