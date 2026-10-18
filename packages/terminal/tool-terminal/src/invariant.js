const PACKAGE_NAME = '@freddie/freddie-tool-terminal'

export const name = 'tool-terminal-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
