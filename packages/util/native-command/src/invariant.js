/**
 * Package-owned invariant companion for `@freddie/freddie-native-command`.
 * @module @freddie/freddie-native-command/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-native-command'

/** Cordis companion plugin name. */
export const name = 'native-command-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: each run is one stateless child-process round trip
 * with no owned event stream or mutable runtime data; behavior is enforced by
 * unit tests.
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
