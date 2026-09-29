/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-tool-call-timeout-policy'

export const name = 'timeout-policy-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
