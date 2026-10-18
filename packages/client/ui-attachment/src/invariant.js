
const PACKAGE_NAME = '@freddie/freddie-client-ui-attachment'

export const name = 'client-ui-attachment-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
