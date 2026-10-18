const PACKAGE_NAME = '@freddie/freddie-session-title-llm'

export const name = 'session-title-llm-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
