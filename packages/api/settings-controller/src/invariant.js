/**
 * Package-owned invariant companion for `@freddie/freddie-api-settings-controller`.
 * @module @freddie/freddie-api-settings-controller/invariant
 */

const PACKAGE_NAME = '@freddie/freddie-api-settings-controller'

/** Cordis companion plugin name. */
export const name = 'api-settings-controller-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: every verb re-reads the live provider and rebuilds its
 * answer from the provider's own redacted projection, so there is no local
 * copy of a setting or a credential for a witness to compare against.
 */
const install = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
