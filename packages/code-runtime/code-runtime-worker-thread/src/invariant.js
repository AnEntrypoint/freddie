
const PACKAGE_NAME = '@freddie/freddie-code-runtime-worker-thread'

export const name = 'code-runtime-worker-thread-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
