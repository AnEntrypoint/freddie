/**
 * Package-owned invariant companion for `@freddie/freddie-api-plugin-manager-controller`.
 * @module @freddie/freddie-api-plugin-manager-controller/invariant
 */

const PACKAGE_NAME = '@freddie/freddie-api-plugin-manager-controller'

/** Cordis companion plugin name. */
export const name = 'api-plugin-manager-controller-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: every verdict is re-derived from the live Loader and
 * Fiber graph per call, so there is no local copy for a witness to compare against.
 */
const install = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
