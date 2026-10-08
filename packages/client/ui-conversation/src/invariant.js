const PACKAGE_NAME = '@freddie/freddie-client-ui-conversation'

export const name = 'client-ui-conversation-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
