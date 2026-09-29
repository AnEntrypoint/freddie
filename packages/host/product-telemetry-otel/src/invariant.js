/**
 * Package-owned invariant companion for `@freddie/freddie-host-product-telemetry-otel`.
 * @module @freddie/freddie-host-product-telemetry-otel/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-host-product-telemetry-otel'

/** Cordis companion plugin name. */
export const name = 'host-product-telemetry-otel-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: record admission happens inside the SDK processor, which
 * exposes no queue depth, dropped count, or export outcome a companion could
 * compare against what a caller submitted. Delivery is best effort by contract,
 * so an absent acknowledgement is the expected state rather than corruption.
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
