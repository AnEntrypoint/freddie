/**
 * Package-owned invariant companion for `@freddie/freddie-sdk-client`.
 * @module @freddie/freddie-sdk-client/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-sdk-client'

/** Cordis companion plugin name. */
export const name = 'sdk-client-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this client library runs outside any harness context
 * (its peer is a separate runtime process); the runtime's own packages own
 * the event-stream relations.
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
