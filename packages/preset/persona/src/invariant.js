const PACKAGE_NAME = '@freddie/freddie-persona'

export const name = 'persona-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
