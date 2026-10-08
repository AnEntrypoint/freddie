const PACKAGE_NAME = '@freddie/freddie-workflow-worker-thread'

export const name = 'workflow-worker-thread-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
