
const PACKAGE_NAME = '@freddie/freddie-compaction-tool-result-pruner'

export const name = 'compaction-tool-result-pruner-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
