/**
 * Package-owned invariant companion for `@freddie/freddie-tool-ralph`.
 * @module @freddie/freddie-tool-ralph/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-tool-ralph'

/** Cordis companion plugin name. */
export const name = 'tool-ralph-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this model-facing orchestration adapter owns no independent event stream;
 * workflow and subagent owners validate the runs and child lifecycles it starts.
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
