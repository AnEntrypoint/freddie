const PACKAGE_NAME = '@freddie/freddie-tool-web'

export const name = 'tool-web-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
