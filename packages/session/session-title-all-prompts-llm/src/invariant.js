/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-session-title-all-prompts-llm'

export const name = 'session-title-all-prompts-llm-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
