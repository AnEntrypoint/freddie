/**
 * Package-owned invariant companion for `@freddie/freddie-tool-gm`.
 * @module @freddie/freddie-tool-gm/invariant
 */

const PACKAGE_NAME = '@freddie/freddie-tool-gm'

/** Cordis companion plugin name. */
export const name = 'tool-gm-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

// No runtime invariant: each successful model-tool dispatch appends exactly one
// log-only `gm/progress` snapshot after the daemon response commits; the session
// append boundary is authoritative and contains malformed durable payloads.
const install = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
