/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-client-ui-settings-plugin-inventory'

export const name = 'client-ui-settings-plugin-inventory-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
