

const PACKAGE_NAME = '@freddie/freddie-client-ui-directory-picker-browse'

export const name = 'client-ui-directory-picker-browse-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
