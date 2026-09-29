/**
 * Package-owned invariant companion for `@freddie/freddie-sdk-app`.
 * @module @freddie/freddie-sdk-app/invariant
 */

const PACKAGE_NAME = '@freddie/freddie-sdk-app'

/** Cordis companion plugin name. */
export const name = 'sdk-app-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/**
 * No runtime invariant: the startup provider reads the launcher's immutable
 * argument snapshot and publishes a latch whose only consumer is the JSON-RPC
 * server row's injection, and the stdin binding it installs is a process-level
 * listener against the launcher's exit request. Neither holds an auditable
 * in-tree relation; every row this patch mounts belongs to its own package,
 * and that package carries that row's invariants.
 */
const install = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
