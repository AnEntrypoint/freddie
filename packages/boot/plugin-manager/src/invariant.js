/**
 * Package-owned invariant companion for `@freddie/freddie-plugin-manager`.
 * @module @freddie/freddie-plugin-manager/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-plugin-manager'

/** Cordis companion plugin name. */
export const name = 'plugin-manager-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: enablement is a patch-document row owned by
 * `@freddie/freddie-config-editor`, and the lifecycle consequence is Loader's
 * own `Entry.update` — neither is an in-process relation this package owns.
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
