/**
 * Types shared by job producers, the registry, and controllers. The
 * service implementation lives in `./index.js`.
 * @module @freddie/freddie-jobs/types
 */

export { JobId } from './brand.js'

/**
 * Task lifecycle: `running`, optionally `stopping`, then exactly one terminal
 * status. Producer-specific facts belong in {@link JobSnapshot.detail}.
 */

/**
 * Producer-defined job kinds. Plugins extend this map by declaration merging;
 * the registry treats every value as an opaque id namespace.
 */

/** The merge-extensible union of registered producer kind names. */

/** Terminal result supplied by a producer through {@link JobHooks.done}. */

/**
 * Producer declaration passed to {@link JobRegistry.start}. The runtime
 * preflights access and cleanup before invoking {@link run}; the producer owns
 * execution resources while the runtime owns identity and lifecycle state.
 */

/** Hooks through which the runtime controls and observes producer work. */

/**
 * A read-only projection of one job, safe to hand to listeners and tools —
 * a fresh object per call, never live registry state.
 */

/** Output and post-read state returned by {@link JobRegistry.read}. */

/**
 * Completion callback with the exact owner supplied at start, or `undefined`
 * for an unowned job. Returned promises are observed but not awaited.
 */

/**
 * Observation callback for a change to what one owner's {@link JobRegistry.list}
 * would return. It is owner-granular rather than job-granular because the
 * change may be a removal, which no per-job record can express, and because
 * its consumers re-read the whole visible set anyway.
 *
 * An `undefined` owner means an unowned job changed, so every caller's visible
 * set changed with it.
 */
