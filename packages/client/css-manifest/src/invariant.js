/**
 * Package-owned invariant companion for `@freddie/freddie-client-css-manifest`.
 * @module @freddie/freddie-client-css-manifest/invariant
 */

const PACKAGE_NAME = '@freddie/freddie-client-css-manifest'

/** Cordis companion plugin name. */
export const name = 'css-manifest-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

// No runtime invariant: the package serves a static CSS-file manifest and
// injects stylesheet links into the page head; it owns no session events or
// mutable logged relation to check.
const install = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
