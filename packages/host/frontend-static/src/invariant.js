const PACKAGE_NAME = '@freddie/freddie-host-frontend-static'

export const name = 'host-frontend-static-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
