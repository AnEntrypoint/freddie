const PACKAGE_NAME = '@freddie/freddie-app-boot'

export const name = 'app-boot-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
