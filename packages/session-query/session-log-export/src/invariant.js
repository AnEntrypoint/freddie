/** Package invariant companion for `@freddie/freddie-session-log-export`. */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-session-log-export'

export const name = 'session-export-invariant'
export const inject = ['invariants']

/** No runtime invariant: the command registry owns lifecycle pairing and ApiProxy owns ZIP integrity. */
const install = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Host context carrying the invariant registry.
 * @returns the registration disposer after setup succeeds.
 */
export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
