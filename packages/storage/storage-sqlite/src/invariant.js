/**
 * Package-owned invariant companion for `@freddie/freddie-storage-sqlite`.
 * @module @freddie/freddie-storage-sqlite/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-storage-sqlite'

/** Cordis companion plugin name. */
export const name = 'storage-sqlite-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: correctness here is write-durability and
 * publish-then-reread equivalence, which requires medium round-trip
 * verification, not a continuously observable in-process relation.
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
