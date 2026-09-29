/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-plugin-manager'

export const name = 'plugin-manager-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
