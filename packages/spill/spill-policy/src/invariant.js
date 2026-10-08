const PACKAGE_NAME = '@freddie/freddie-spill-policy'

export const name = 'spill-policy-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
