
const PACKAGE_NAME = '@freddie/freddie-code-runtime'

export const name = 'code-runtime-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
