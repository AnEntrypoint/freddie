/**
 * Package-owned invariant companion for `@freddie/freddie-session-turn-outline`.
 * @module @freddie/freddie-session-turn-outline/invariant
 */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-session-turn-outline'

/** Cordis companion plugin name. */
export const name = 'session-turn-outline-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the package owns a single pure projection fold, and
 * every relation it depends on is owned and runtime-checked elsewhere —
 * monotonic host-assigned turn numbers and `turn/start` preceding a turn's
 * prompt by freddie-agent-loop, and the message source and content shapes by
 * the session surface. Re-folding the same log here would duplicate the
 * implementation instead of comparing independently maintained observations.
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
