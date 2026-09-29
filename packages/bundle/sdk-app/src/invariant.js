
const PACKAGE_NAME = '@freddie/freddie-sdk-app'

export const name = 'sdk-app-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
