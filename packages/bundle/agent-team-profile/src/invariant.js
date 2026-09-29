/**
 * Package-owned invariant companion for `@freddie/freddie-agent-team-profile`.
 * @module @freddie/freddie-agent-team-profile/invariant
 */

const PACKAGE_NAME = '@freddie/freddie-agent-team-profile'

/** Cordis companion plugin name. */
export const name = 'agent-team-profile-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package owns no service, event, or store of its
 * own — its whole substance is the patch list that targets other packages'
 * rows by id, and each row's relationships belong to the package that mounts
 * it (`@freddie/freddie-experimental-agent-team` owns the durable Team stream
 * invariant; `@freddie/freddie-experimental-tool-agent-team` owns the scoped
 * tool registrations it installs per Agent). A patch layer adds no relation an
 * invariant could audit.
 */
const install = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
