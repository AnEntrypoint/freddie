const PACKAGE_NAME = '@freddie/freddie-client-ui-workspace'

export const name = 'client-ui-workspace-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
