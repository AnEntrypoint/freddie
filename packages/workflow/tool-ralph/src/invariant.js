const PACKAGE_NAME = '@freddie/freddie-tool-ralph'

export const name = 'tool-ralph-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
