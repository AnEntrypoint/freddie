export const name = 'ui-artifacts-invariant'
export const inject = ['invariants']
const install = () => {}
export const apply = ctx => Promise.resolve(ctx.invariants.register('@freddie/freddie-client-ui-artifacts', install))
