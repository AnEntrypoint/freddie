/**
 * Package-owned invariant companion for `@freddie/freddie-acp-demo`.
 * @module @freddie/freddie-acp-demo/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-acp-demo'

/** Cordis companion plugin name. */
export const name = 'acp-demo-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this composition package owns no independent event stream or mutable data;
 * Loader and built-entry tests cover its wiring.
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
