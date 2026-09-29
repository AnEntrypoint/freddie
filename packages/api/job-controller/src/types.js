/**
 * Wire vocabulary of the `job` Remote namespace: the per-session roster
 * generation and the human kill. Client-safe: nothing here reaches a Host-only
 * symbol, so a Client compilation face reads the same frames the Host emits.
 *
 * This module carries no runtime exports — every declaration here was a
 * TypeScript-only type, interface, or module augmentation with zero
 * runtime value.
 *
 * @module @freddie/freddie-job-controller/types
 */

/**
 * Roster generation target: the session whose visible jobs the generation
 * mirrors. freddie resolves it through the Typert `agent` lookup, so the wire
 * carries `agentId` and the generation receives the live Agent object that
 * `ctx.jobs` fences its reads against.
 * @typedef {object} JobRosterGenerationTarget
 * @property {string} agentId Wire-carried session identity resolved through the Typert `agent` lookup.
 */

/**
 * One roster frame: the complete set the session can see — its own jobs plus
 * every unowned job — after a lifecycle change. Whole-set replacement, so a
 * reconnect's first frame is already the truth.
 * @typedef {object} JobRosterFrame
 * @property {'rows'} type
 * @property {readonly unknown[]} jobs The session's own jobs plus every unowned job, from `ctx.jobs`.
 */

/**
 * Human-initiated cancellation of one job the session can see. The body
 * carries only the job id; the session rides the lookup wire.
 * @typedef {object} JobKillRequest
 * @property {string} jobId
 */

/**
 * Receipt after the registry accepted the human kill request: `requested` for
 * live work, `already-finished` otherwise.
 * @typedef {object} JobKillValue
 * @property {'requested' | 'already-finished'} outcome
 */

/**
 * Terminal rejection when the session's job list no longer carries a killable
 * row under that id — an unknown job, or one belonging to another session.
 * Returned as the Remote call's typed failure, never as an infrastructure
 * error, so a client can render one story for both registry refusals.
 * @typedef {object} JobKillRefusal
 * @property {'job/not-found'} code
 * @property {string} message
 * @property {object} details
 * @property {string} details.sessionId
 * @property {string} details.jobId
 */
