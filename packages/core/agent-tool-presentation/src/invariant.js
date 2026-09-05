/**
 * Package-owned invariant companion for `@freddie/freddie-agent-tool-presentation`.
 * @module @freddie/freddie-agent-tool-presentation/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-agent-tool-presentation'

/** Cordis companion plugin name. */
export const name = 'tool-presentation-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package makes exactly one scoped call into
 * `ctx.tools` and owns no event or snapshot of its own; the relation it
 * establishes — which presentation one agent's assembly uses — is the tool
 * registry's to hold, and `freddie-tools` observes it there.
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
