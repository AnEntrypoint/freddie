
const PACKAGE_NAME = '@freddie/freddie-command-compact'

export const name = 'command-compact-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
