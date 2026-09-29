/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-settings-file'

export const name = 'settings-file-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
