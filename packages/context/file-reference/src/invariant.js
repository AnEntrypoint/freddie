
/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-file-reference'

export const name = 'file-reference-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
