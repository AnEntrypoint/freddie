/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-experimental-browser-use-runtime'

/** Cordis companion plugin name. */
export const name = 'browser-use-runtime-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: resource ownership, acquisition, and pending operations
 * are private lifecycle state inside one provider instance, with no separately
 * maintained runtime projection to compare them against.
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
