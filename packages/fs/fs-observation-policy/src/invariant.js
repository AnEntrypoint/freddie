const PACKAGE_NAME = '@freddie/freddie-fs-observation-policy'

export const name = 'fs-observation-policy-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
