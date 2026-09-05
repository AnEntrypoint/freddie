/**
 * Package-owned invariant companion for `@freddie/freddie-client-ui-agent-preset`.
 * @module @freddie/freddie-client-ui-agent-preset/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-client-ui-agent-preset'

/** Cordis companion plugin name. */
export const name = 'client-ui-agent-preset-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this is a browser-side surface plugin whose node half owns no event stream
 * or mutable runtime data; the roster and the settings write are host contracts covered there.
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
