/**
 * Package-owned invariant companion for `@freddie/freddie-fs-local`.
 * @module @freddie/freddie-fs-local/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-fs-local'

/** Cordis companion plugin name. */
export const name = 'fs-local-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package exposes no independent event sequence or mutable data relation
 * beyond contracts enforced at its owning seam.
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
