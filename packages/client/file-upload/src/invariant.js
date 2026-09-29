/**
 * Package-owned invariant companion for `@freddie/freddie-client-file-upload`.
 * @module @freddie/freddie-client-file-upload/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-client-file-upload'

/** Cordis companion plugin name. */
export const name = 'client-file-upload-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the package's one cross-plugin relation — a staged
 * receipt resolving only inside the session that uploaded it — holds by
 * construction (receipt tables are keyed by session id and looked up through
 * that key) rather than by a check whose failure would have to be reported.
 * The route's register/dispose symmetry is already audited by the webserver
 * package's own invariant.
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
