/**
 * Package-owned invariant companion for `@freddie/freddie-job-controller`.
 * @module @freddie/freddie-job-controller/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-job-controller'

/** Cordis companion plugin name. */
export const name = 'job-controller-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** Check that the registry's controller service outlives the controller's own attachment. */
const install = Object.assign((ctx, fail) => {
  if (ctx.get('jobController') === undefined) return
  if (ctx.jobs.servesOwner(undefined) !== true) {
    fail('ctx.jobController is live but ctx.jobs reports no controller serving any owner')
  }
}, { inject: ['jobs'] })

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
