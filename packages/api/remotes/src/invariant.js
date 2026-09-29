/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-api-remotes'

export const name = 'api-remotes-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
