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

/** Identifies one accepted subagent run across its lifecycle event pair. */

/**
 * Brand a string as a {@link SubagentRunId}.
 * @param id - the raw run id.
 * @returns the same string, branded.
 */
export function SubagentRunId(id) {
  return id
}
