const PACKAGE_NAME = '@freddie/freddie-tool-bash'

export const name = 'tool-bash-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
