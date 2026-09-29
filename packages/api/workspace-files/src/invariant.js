const PACKAGE_NAME = '@freddie/freddie-api-workspace-files'

export const name = 'api-workspace-files-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
