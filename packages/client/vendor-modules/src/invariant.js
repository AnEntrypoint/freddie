/**
 * Package-owned invariant companion for `@freddie/freddie-client-vendor-modules`.
 * @module @freddie/freddie-client-vendor-modules/invariant
 */

const PACKAGE_NAME = '@freddie/freddie-client-vendor-modules'

/** Cordis companion plugin name. */
export const name = 'vendor-modules-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

const installWithoutRuntimeChecks = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, installWithoutRuntimeChecks))
