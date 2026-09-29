/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-subagent-fork-in-process'

export const name = 'subagent-fork-in-process-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
