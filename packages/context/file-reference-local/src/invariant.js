/**
 * Package-owned invariant companion for `@freddie/freddie-file-reference-local`.
 * @module @freddie/freddie-file-reference-local/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-file-reference-local'

/** Cordis companion plugin name. */
export const name = 'file-reference-local-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: per-agent indexes are private advisory caches whose
 * invalidation and disposal are observed directly through service tests.
 */
const install = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
