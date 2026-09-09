/**
 * Package-owned invariant companion for `@freddie/freddie-skill-filesystem`.
 * @module @freddie/freddie-skill-filesystem/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-skill-filesystem'

/** Cordis companion plugin name. */
export const name = 'skill-filesystem-invariant'
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
export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
