/**
 * Package-owned invariant companion for `@freddie/freddie-tool-gm`.
 * @module @freddie/freddie-tool-gm/invariant
 */

const PACKAGE_NAME = '@freddie/freddie-tool-gm'

/** Cordis companion plugin name. */
export const name = 'tool-gm-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

// No runtime invariant: tool-gm registers model-facing tools over `ctx.gm` and
// emits no session events of its own; gm spool state lives on disk under
// `.gm/`, outside the session log.
const install = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
