/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-spill-local'

export const name = 'spill-local-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
