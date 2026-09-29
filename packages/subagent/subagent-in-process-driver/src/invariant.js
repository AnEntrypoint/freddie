/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-subagent-in-process-driver'

export const name = 'subagent-in-process-driver-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
