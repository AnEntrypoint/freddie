/**
 * Package-owned invariant companion for `@freddie/freddie-e2b`.
 * @module @freddie/freddie-e2b/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-e2b'

/** Cordis companion plugin name. */
export const name = 'e2b-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: sandbox creation and teardown have one SDK promise and
 * no independent event or mutable-data relationship to cross-check.
 */
const install = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
