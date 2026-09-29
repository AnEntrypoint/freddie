/**
 * Package-owned invariant companion for `@freddie/freddie-api-workspace-controller`.
 * @module @freddie/freddie-api-workspace-controller/invariant
 */

const PACKAGE_NAME = '@freddie/freddie-api-workspace-controller'

/** Cordis companion plugin name. */
export const name = 'api-workspace-controller-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: every verb re-reads the durable registry after its
 * write and projects the committed entity, so there is no local copy of the
 * workspace order for a witness to compare against.
 */
const install = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
