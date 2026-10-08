const PACKAGE_NAME = '@freddie/freddie-client-ui-input-trigger'

export const name = 'client-ui-input-trigger-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
