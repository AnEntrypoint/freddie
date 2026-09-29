
const PACKAGE_NAME = '@freddie/freddie-acp-app'

export const name = 'acp-app-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
