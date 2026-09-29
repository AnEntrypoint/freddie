/**
 * Package-owned invariant companion for `@freddie/freddie-client-ui-settings-web-search`.
 * @module @freddie/freddie-client-ui-settings-web-search/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-client-ui-settings-web-search'

/** Cordis companion plugin name. */
export const name = 'client-ui-settings-web-search-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this is a browser-side settings card with no node half
 * of its own; the credential write it performs is the credentials domain's
 * contract, and the settings write is the settings service's.
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
