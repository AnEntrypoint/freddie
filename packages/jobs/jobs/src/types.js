/**
 * Types shared by job producers, the registry, and controllers. The
 * service implementation lives in `./index.js`.
 * @module @freddie/freddie-jobs/types
 */

export { JobId } from './brand.js'

/**
 * Task lifecycle: `running`, optionally `stopping`, then exactly one terminal
 * status. Producer-specific facts belong in {@link JobSnapshot.detail}.
 * @typedef {'running' | 'stopping' | 'completed' | 'killed' | 'failed'} JobStatus
 */

/**
 * Producer-defined job kinds. Plugins extend this map by declaration merging;
 * the registry treats every value as an opaque id namespace.
 * @typedef {Record<string, unknown>} JobKinds
 */

/** The merge-extensible union of registered producer kind names. @typedef {string} JobKind */

/**
 * Terminal result supplied by a producer through {@link JobHooks.done}.
 * @typedef {object} JobOutcome
 * @property {JobStatus} status - one of the three terminal statuses.
 * @property {string} [detail] - producer-supplied terminal detail.
 * @property {string} [output] - producer-supplied final output text, when not read incrementally.
 */

/**
 * Producer declaration passed to {@link import('./index.js').JobRegistry#start}.
 * The runtime preflights access and cleanup before invoking {@link JobSpec.run};
 * the producer owns execution resources while the runtime owns identity and
 * lifecycle state.
 * @typedef {object} JobSpec
 * @property {JobKind} kind - producer-defined job kind; forms the issued id's prefix.
 * @property {string} label - operator-facing label.
 * @property {number} [outputLimitBytes] - optional cap enforced by the runtime.
 * @property {import('@freddie/freddie-agent').Agent} [owner] - owning agent; access-fenced by session id when set.
 * @property {() => JobHooks} run - synchronously starts execution and returns its control hooks.
 */

/** Hooks through which the runtime controls and observes producer work.
 * @typedef {object} JobHooks
 * @property {(reason: string) => void} cancel - request cooperative cancellation.
 * @property {Promise<JobOutcome>} done - resolves once, with the terminal outcome.
 * @property {() => string} [readOutput] - optional non-consuming read of accumulated output.
 */

/**
 * A read-only projection of one job, safe to hand to listeners and tools —
 * a fresh object per call, never live registry state.
 * @typedef {object} JobSnapshot
 * @property {ReturnType<typeof import('./brand.js').JobId>} id
 * @property {JobKind} kind
 * @property {string} label
 * @property {number} [outputLimitBytes]
 * @property {string} [ownerSession] - the owning agent's session id, when owned.
 * @property {JobStatus} status
 * @property {string} [detail] - terminal detail, once settled.
 * @property {number} startedAt
 * @property {number} [finishedAt]
 * @property {boolean} reported
 */

/** Output and post-read state returned by {@link import('./index.js').JobRegistry#read}.
 * @typedef {object} JobReadResult
 * @property {string} text - the delta or idempotent final output.
 * @property {JobSnapshot} snapshot - the post-read snapshot.
 */

/**
 * Completion callback with the exact owner supplied at start, or `undefined`
 * for an unowned job. Returned promises are observed but not awaited.
 * @typedef {(snapshot: JobSnapshot, owner: import('@freddie/freddie-agent').Agent | undefined) => (void | Promise<void>)} JobDoneListener
 */

/**
 * Observation callback for a change to what one owner's
 * {@link import('./index.js').JobRegistry#list} would return. It is
 * owner-granular rather than job-granular because the change may be a
 * removal, which no per-job record can express, and because its consumers
 * re-read the whole visible set anyway.
 *
 * An `undefined` owner means an unowned job changed, so every caller's visible
 * set changed with it.
 * @typedef {(owner: import('@freddie/freddie-agent').Agent | undefined) => void} JobsChangedListener
 */
