/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-web-fetch-http'

export const name = 'web-fetch-http-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
