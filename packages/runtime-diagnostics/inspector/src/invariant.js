/**
 * Package-owned invariant companion for `@freddie/freddie-inspector`.
 * @module @freddie/freddie-inspector/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-inspector'

/** Cordis companion plugin name. */
export const name = 'inspector-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: every fact a companion could check here is already
 * enforced where it is decided. The bind is asserted by `assertLoopback` before
 * the Worker spawns and verified again from the bound socket, so a non-loopback
 * endpoint cannot exist to be observed; the fetch journal is Worker memory with
 * no durable or mirrored copy, so it offers no cross-record relationship; and
 * the Cordis projection is recomputed from live fibers, so it holds no mutable
 * state of its own. Checking any of those from another registry would only
 * duplicate the enforcement.
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
