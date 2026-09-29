const PACKAGE_NAME = '@freddie/freddie-host-directory-picker'

export const name = 'host-directory-picker-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
