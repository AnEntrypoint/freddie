/** Browser-only presentation package. */

export const name = 'ui-observability-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx => Promise.resolve(ctx.invariants.register('@freddie/freddie-client-ui-observability', install))
