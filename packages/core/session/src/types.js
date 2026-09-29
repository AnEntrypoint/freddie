/**
 * Brand a string as a {@link SessionId}.
 * @param id - the raw session id string.
 * @returns the same string, branded (a compile-time cast — no runtime cost).
 */
export function SessionId(id) {
  return id
}

/**
 * Detached, deep-frozen session creation metadata, validated by
 * `validateSessionHeader` in `./index.js` and published as `Session.header`.
 * @typedef {object} SessionHeader
 * @property {number} version - {@link SESSION_FORMAT_VERSION} at creation time.
 * @property {string} id - the session identity; must match the owning session.
 * @property {number} createdAt - non-negative safe-integer creation timestamp.
 * @property {string} [cwd] - absolute working directory.
 * @property {string} [parentSession] - fork source session id, when forked.
 * @property {number} [seedLength] - event count carried over from the fork source.
 * @property {'subagent'} [origin] - present when this session is a subagent session.
 * @property {number} [delegationDepth] - non-negative subagent delegation depth.
 * @property {string} [agentPreset] - id of the agent preset this session was created under.
 */

/**
 * One entry in a session's append-only log. `data` is per-`type` payload;
 * `surfaceOp`/`sourceEventSeqs`/`ignorable` are the optional structural fields
 * every event may carry (see `./surface.js` for `surfaceOp`/`sourceEventSeqs`).
 * @typedef {object} SessionEvent
 * @property {string} type - the event type (a key of {@link SessionEventMap}).
 * @property {number} seq - contiguous, zero-based position in the log.
 * @property {number} time - safe-integer timestamp.
 * @property {*} data - the type-specific, losslessly JSON-serializable payload.
 * @property {SurfaceOp} [surfaceOp] - how this event enters the ordered surface; required for {@link SurfaceEventType} events.
 * @property {readonly number[]} [sourceEventSeqs] - earlier event seqs this one derives from.
 * @property {true} [ignorable] - marks an event type outside {@link import('./known-event-types.js').KNOWN_SESSION_EVENT_TYPES} as safe to skip on load rather than a corruption signal.
 */

/**
 * Merge-extensible map from session event type to its `data` payload shape.
 * Core members are declared across this package's modules and gathered by
 * `./known-event-types.js`'s `KNOWN_SESSION_EVENT_TYPES`; plugins
 * declaration-merge their own `type` keys (e.g. `compaction/*`, `hook/*`).
 * @typedef {Object<string, *>} SessionEventMap
 */

/**
 * The three event types that produce {@link import('./surface.js').deriveEventMessage | derived LLM messages}
 * and therefore require a {@link SurfaceOp} marker: `'user/message'`,
 * `'assistant/message'`, `'tool/result'`.
 * @typedef {'user/message'|'assistant/message'|'tool/result'} SurfaceEventType
 */

/**
 * How one {@link SurfaceEventType} event enters the ordered surface: append to
 * the tail, or positionally replace an existing inclusive range (compaction).
 * @typedef {'append'|SurfaceReplaceOp} SurfaceOp
 */

/**
 * @typedef {object} SurfaceReplaceOp
 * @property {'replace'} op
 * @property {number} start - inclusive first shadowed surface-node event seq.
 * @property {number} end - inclusive last shadowed surface-node event seq.
 */

/**
 * The canonical `request/header` snapshot in force after the log's last
 * header event, as folded by `./request-header.js`'s `canonicalHeader`.
 * @typedef {object} EpochHeader
 * @property {import('@freddie/freddie-llm').LlmCallConfig} config - provider/model route and request controls.
 * @property {{reasoningEffort?: true, maxTokens?: true}} [adapterDefaults] - which `config` fields were adapter-materialized rather than caller-set.
 * @property {string} [system] - non-empty system prompt text.
 * @property {readonly *[]} [tools] - non-empty tool schema list.
 */

/**
 * The on-disk session format version, stamped into every newly-written {@link SessionHeader}
 * and enforced by every persistence backend on load. The single source of truth for the
 * version — write sites and the load-time check all read it.
 * While the harness is unreleased it is pinned at `0`: no compatibility is
 * implied, incompatible logs are rejected, and no migration is provided.
 *
 * The version is a single monotonic integer with no major/minor split. Whether
 * a bump is needed is decided by what the WRITER emits, never by what a newer
 * reader can accept: bump exactly when an older runtime could no longer handle
 * a new log with full semantic correctness ("parses without error" is not
 * correctness — silently skipping content that shapes reconstruction is a
 * wrong read). Only structural changes reach that bar: the header shape, the
 * {@link SessionEvent} envelope, core event semantics, or the surface
 * mechanism (the {@link SurfaceEventType} set and {@link SurfaceOp} variants).
 * Adding an ordinary event type does not bump — the per-event
 * {@link SessionEvent.ignorable} guard covers vocabulary growth instead. When
 * in doubt, bump: a near-identity upgrade step is almost free, a missed bump
 * makes older runtimes read new logs wrong silently. The full mechanism
 * (upgrade-step chain, in-memory view conversion, migrate-on-continue) is
 * recorded in the session-log-version-mechanism Agent Note
 * (`.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.md`).
 */
export const SESSION_FORMAT_VERSION = 0
