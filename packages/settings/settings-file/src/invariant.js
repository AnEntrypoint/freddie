/**
 * Package-owned invariant companion for `@freddie/freddie-settings-file`.
 * @module @freddie/freddie-settings-file/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-settings-file'

/** Cordis companion plugin name. */
export const name = 'settings-file-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this provider's contracts are file round-trip,
 * watcher timing, and atomic-write behavior — IO effects proven by package
 * tests; the in-process commit relation is owned by `@freddie/freddie-settings`.
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
