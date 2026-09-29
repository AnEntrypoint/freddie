/**
 * Package-owned invariant companion for `@freddie/freddie-base`.
 * @module @freddie/freddie-base/invariant
 */

const PACKAGE_NAME = '@freddie/freddie-base'

/** Cordis companion plugin name. */
export const name = 'base-bundle-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

const installNoRuntimeInvariants = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, installNoRuntimeInvariants))
