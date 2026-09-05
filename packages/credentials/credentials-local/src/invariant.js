/**
 * Package-owned invariant companion for `@freddie/freddie-credentials-local`.
 * @module @freddie/freddie-credentials-local/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-credentials-local'

/** Cordis companion plugin name. */
export const name = 'credentials-local-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the Service Definition companion (`freddie-credentials/invariant`) owns the
 * `credentials/reference-updated` lifecycle contract; this provider's file/environment layering is
 * asynchronous I/O pinned by its unit suite.
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
