/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-client-file-upload'

export const name = 'client-file-upload-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
