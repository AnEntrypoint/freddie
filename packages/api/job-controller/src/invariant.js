/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-job-controller'

export const name = 'job-controller-invariant'
export const inject = ['invariants']

const install = Object.assign((ctx, fail) => {
  if (ctx.get('jobController') === undefined) return
  if (ctx.jobs.servesOwner(undefined) !== true) {
    fail('ctx.jobController is live but ctx.jobs reports no controller serving any owner')
  }
}, { inject: ['jobs'] })

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
