/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-repeat-tool-reminder'

export const name = 'repeat-tool-reminder-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
