
/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-client-ui-brand-official'

export const name = 'client-ui-brand-official-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
