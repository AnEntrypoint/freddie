/**
 * Package-owned invariant companion for `@freddie/freddie-tool-fs-search`.
 * @module @freddie/freddie-tool-fs-search/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-tool-fs-search'

/** Cordis companion plugin name. */
export const name = 'tool-fs-search-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this model-facing adapter has no independent lifecycle stream; execution
 * relations are owned by the capability seam it calls.
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
