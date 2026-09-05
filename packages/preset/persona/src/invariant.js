/**
 * Package-owned invariant companion for `@freddie/freddie-persona`.
 * @module @freddie/freddie-persona/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-persona'

/** Cordis companion plugin name. */
export const name = 'persona-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this row owns no event stream or mutable runtime data — it registers one
 * prompt section and the prompt registry owns identity, complete-prompt enforcement, shadowing,
 * and disposal.
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
