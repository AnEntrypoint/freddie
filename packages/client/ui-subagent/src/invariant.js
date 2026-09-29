/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-client-ui-subagent'

export const name = 'client-ui-subagent-invariant'
export const inject = ['invariants']

const installNoRuntimeInvariant = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, installNoRuntimeInvariant))
/* jscpd:ignore-end */
