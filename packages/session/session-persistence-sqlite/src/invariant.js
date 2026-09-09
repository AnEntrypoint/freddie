/**
 * Package-owned invariant companion for `@freddie/freddie-session-persistence-sqlite`.
 * @module @freddie/freddie-session-persistence-sqlite/invariant
 */

/* jscpd:ignore-start */

const PACKAGE_NAME = '@freddie/freddie-session-persistence-sqlite'

/** Cordis companion plugin name. */
export const name = 'session-persistence-sqlite-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: physical packing is observable only by database
 * round-trip and row-count checks, not a continuous in-process relation.
 */
const install = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
