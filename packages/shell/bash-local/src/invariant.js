/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-bash-local'

export const name = 'bash-local-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
