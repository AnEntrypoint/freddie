const PACKAGE_NAME = '@freddie/freddie-inspector'

export const name = 'inspector-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
