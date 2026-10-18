
const PACKAGE_NAME = '@freddie/freddie-compaction-basic'

export const name = 'compaction-basic-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
