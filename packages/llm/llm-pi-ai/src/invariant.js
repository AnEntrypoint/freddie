/**
 * Package-owned invariant companion for `@freddie/freddie-llm-pi-ai`.
 * @module @freddie/freddie-llm-pi-ai/invariant
 */

const PACKAGE_NAME = '@freddie/freddie-llm-pi-ai'

/** Cordis companion plugin name. */
export const name = 'llm-pi-ai-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: this package exposes no independent event sequence beyond contracts enforced at its owning seam. */
const install = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = ctx => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
