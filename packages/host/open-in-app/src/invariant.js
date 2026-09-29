/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-host-open-in-app'

export const name = 'host-open-in-app-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
