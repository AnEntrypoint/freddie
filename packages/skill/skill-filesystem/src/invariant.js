/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-skill-filesystem'

export const name = 'skill-filesystem-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
