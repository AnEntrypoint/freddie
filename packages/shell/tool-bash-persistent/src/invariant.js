const PACKAGE_NAME = '@freddie/freddie-tool-bash-persistent'

export const name = 'tool-bash-persistent-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
