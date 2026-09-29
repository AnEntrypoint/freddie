/**
 * Package-owned invariant companion for `@freddie/freddie-config-editor`.
 * @module @freddie/freddie-config-editor/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-config-editor'

/** Cordis companion plugin name. */
export const name = 'config-editor-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: an edit's contracts are patch-document round-trip,
 * file-lock ordering, and Loader application — IO and lifecycle effects proven
 * by running the write against a real profile, not by an in-process relation
 * this package owns.
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
