
const PACKAGE_NAME = '@freddie/freddie-headless'

export const name = 'headless-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
