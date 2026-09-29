/**
 * Package-owned invariant companion for `@freddie/freddie-api-workspace-files`.
 * @module @freddie/freddie-api-workspace-files/invariant
 */

const PACKAGE_NAME = '@freddie/freddie-api-workspace-files'

/** Cordis companion plugin name. */
export const name = 'api-workspace-files-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: every read re-resolves its target through `ctx.fs` and
 * proves containment against the live workspace root, so there is no cached
 * path decision for a witness to compare against.
 */
const install = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
