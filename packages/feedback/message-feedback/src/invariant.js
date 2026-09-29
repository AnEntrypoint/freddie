/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-message-feedback'

export const name = 'message-feedback-invariant'
export const inject = ['invariants']

const install = Object.assign(() => {}, { inject: ['messageFeedback'] })

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
