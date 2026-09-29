/**
 * The seam's consumer-facing contracts: request, result, and capability types
 * for {@link SubagentProvider}, plus the `subagent/start` and `subagent/end`
 * payloads that plugins and hosts observe. Internal control interfaces belong
 * with their implementation — the lifecycle observer in `./lifecycle.js`, the
 * continuation host in `./continuation.js` — so this module stays the published
 * surface rather than a bag of everything type-shaped.
 *
 * @module @freddie/freddie-subagent/types
 */

/**
 * Identifies one accepted subagent run across its lifecycle event pair.
 * @typedef {string} SubagentRunId
 */

/**
 * A registered subagent backend. `start` and, when continuable children are
 * supported, `prepareContinuable` are the two capability-transfer boundaries;
 * `capabilities` is the start-time feature advertisement the service validates
 * a request against before calling either.
 * @typedef {object} SubagentProvider
 * @property {string} name - the unique name callers select this provider by.
 * @property {{ outputSchema: boolean, depthLimit: boolean, toolFilter: boolean, persona: boolean }} capabilities
 * @property {boolean} inheritsParentContext - whether a started child sees the
 * delegating parent's own conversation context (e.g. a seeded log prefix) or
 * starts fresh.
 * @property {function(object): Promise<import('./out-of-process.js').SubagentRun>} start
 * @property {function(object): Promise<{ seed?: object[] }>} [prepareContinuable]
 * - present only on providers that support continuable children; returns the
 * detached `ContinuableCreateSpec`.
 */

/**
 * The `subagent/start` lifecycle payload: identity shared by both the one-shot
 * and continuable seams.
 * @typedef {object} SubagentRunInfo
 * @property {SubagentRunId} runId
 * @property {string} provider - the provider name that established the run.
 * @property {string} id - the run's session id.
 * @property {boolean} local - whether this run has a local child Agent.
 */

/**
 * The `subagent/end` lifecycle payload: {@link SubagentRunInfo} plus how the
 * run settled.
 * @typedef {object} SubagentRunEndInfo
 * @property {SubagentRunId} runId
 * @property {string} provider
 * @property {string} id
 * @property {boolean} local
 * @property {'completed' | 'aborted' | 'max-tokens' | 'refusal' | 'error'} stopReason
 * @property {Array<object>} [lastAssistantMessage] - the run's final model-facing content, when any.
 */

/**
 * Brand a string as a {@link SubagentRunId}.
 * @param id - the raw run id.
 * @returns the same string, branded.
 */
export function SubagentRunId(id) {
  return id
}
