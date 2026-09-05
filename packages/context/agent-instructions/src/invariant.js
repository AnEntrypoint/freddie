/**
 * Package-owned invariant companion for `@freddie/freddie-agent-instructions`.
 * @module @freddie/freddie-agent-instructions/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-agent-instructions'

/** Cordis companion plugin name. */
export const name = 'workspace-context-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: replay intentionally tolerates unknown or malformed workspace sources,
 * while focused pipeline tests own its private pending/cache state transitions.
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
