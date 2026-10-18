const PACKAGE_NAME = '@freddie/freddie-brand'

export const name = 'brand-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
