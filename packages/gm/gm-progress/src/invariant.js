/** GM progress is an optional ignorable session event projection. */

export const name = 'gm-progress-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx => Promise.resolve(ctx.invariants.register('@freddie/freddie-gm-progress', install))
