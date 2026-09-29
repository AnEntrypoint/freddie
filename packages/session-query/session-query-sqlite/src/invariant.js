/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-session-query-sqlite'

export const name = 'session-query-sqlite-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
