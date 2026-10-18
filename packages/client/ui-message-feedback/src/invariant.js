const PACKAGE_NAME = '@freddie/freddie-client-ui-message-feedback'

export const name = 'client-ui-feedback-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
