const PACKAGE_NAME = '@freddie/freddie-anonymous-user-id'

export const name = 'anonymous-user-id-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
