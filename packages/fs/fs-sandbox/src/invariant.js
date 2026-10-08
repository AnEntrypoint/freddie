const PACKAGE_NAME = '@freddie/freddie-fs-sandbox'

export const name = 'fs-sandbox-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
