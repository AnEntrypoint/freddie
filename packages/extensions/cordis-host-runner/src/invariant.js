/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-cordis-host-runner'

export const name = 'cordis-host-runner-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
