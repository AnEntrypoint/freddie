/**
 * Package-owned invariant companion for `@freddie/freddie-gm-config`.
 * @module @freddie/freddie-gm-config/invariant
 */

const PACKAGE_NAME = '@freddie/freddie-gm-config'

/** Cordis companion plugin name. */
export const name = 'gm-config-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

// No runtime invariant: gm-config is a read-only filesystem resolver over
// already-materialized gm.config.json tiers; it mounts no service and owns
// no session events or durable logged relation to check.
const install = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
