const PACKAGE_NAME = '@freddie/freddie-tool-ask-user'

export const name = 'tool-ask-user-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
