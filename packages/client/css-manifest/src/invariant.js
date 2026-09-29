/**
 * Package-owned invariant companion for `@freddie/freddie-client-css-manifest`.
 * @module @freddie/freddie-client-css-manifest/invariant
 */

const PACKAGE_NAME = '@freddie/freddie-client-css-manifest'

/** Cordis companion plugin name. */
export const name = 'css-manifest-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

const installNoRuntimeInvariant = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, installNoRuntimeInvariant))
