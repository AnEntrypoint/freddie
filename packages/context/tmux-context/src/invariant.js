
/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-tmux-context'

export const name = 'tmux-context-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
