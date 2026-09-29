/** Package-owned invariant companion. @module @freddie/freddie-host-open-in-app/invariant */

/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-host-open-in-app'

/** Cordis companion plugin name. */
export const name = 'host-open-in-app-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: every fact the package could assert is owned and checked
 * where it is produced — route registrations are cordis effects the loader
 * disposes, and each resolution is a fresh probe of this host's filesystem and
 * registry, so re-deriving one here would duplicate the implementation instead
 * of comparing an independent observation.
 */
const install = () => {}

/** Register this package's invariant companion. */
export const apply = ctx => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
