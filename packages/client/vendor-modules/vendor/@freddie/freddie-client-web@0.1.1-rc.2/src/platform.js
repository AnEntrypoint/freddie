/**
 * Shared browser platform modules. Seeding, bundling externals, and Vite
 * aliases consume this list so their module identities cannot drift.
 * @module @freddie/freddie-client-web/src/platform
 */

/** The module specifiers the shell shares into the frozen module table. */
export const PLATFORM_MODULES = [
  'webjsx', '@freddie/cordis',
  '@freddie/freddie-client-ui-slots',
  '@freddie/freddie-client-ui-primitives',
]

/** Client-bundle specifiers whose factories the parser preloads before the shell starts. */
export const PRELOADED_CLIENT_EXTERNALS = [
  '@freddie/freddie-client-runtime/client',
]
