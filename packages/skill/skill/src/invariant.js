/**
 * Package-owned invariant companion for `@freddie/freddie-skill`.
 * @module @freddie/freddie-skill/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-skill'

/** Cordis companion plugin name. */
export const name = 'skill-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: provider/runtime maps and revisioned caches mutate atomically inside the
 * registry, which exposes no independent change event or snapshot for cross-checking them.
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
