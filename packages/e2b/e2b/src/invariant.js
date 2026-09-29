/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-e2b'

export const name = 'e2b-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
