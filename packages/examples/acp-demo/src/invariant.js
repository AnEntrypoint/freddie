/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-acp-demo'

export const name = 'acp-demo-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
