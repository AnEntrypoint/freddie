const PACKAGE_NAME = '@freddie/freddie-llm-pi-ai'

export const name = 'llm-pi-ai-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
