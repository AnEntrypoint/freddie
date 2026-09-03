// Unified context checkpoint + D-Mail (DenwaRenji) system.
// Thin re-export entrypoint — the actual implementation is split across
// checkpoint-store.js (CRUD), dmail.js (D-Mail queue), and session-fork.js
// (fork + lifecycle), kept under the 200-line vertical-slice cap.
//
// Primary store: in-memory Map-based (always available, browser-safe).
// Persistent store: JSONL append-only log at <FREDDIE_HOME>/checkpoints/<sessionId>.jsonl
// (Node.js only; gracefully degrades to memory-only in browser).
//
// Methods:
//   createCheckpoint(sessionId, messages)          -> { id, timestamp }
//   listCheckpoints(sessionId)                     -> [{ id, timestamp, messageCount }]
//   revertToCheckpoint(sessionId, checkpointId)    -> messages[] | null
//   getCheckpointDiff(sessionId, fromId, toId)     -> { messages, fromTimestamp, toTimestamp } | null
//   getCheckpointMessages(sessionId, checkpointId) -> messages[] | null
//   getCheckpointCount(sessionId)                  -> number
//   sendDmail(sessionId, message, checkpointId)    -> { ok: true, ... } | { error }
//   fetchPendingDmail(sessionId)                   -> { message, checkpointId } | null
//   forkSession(sessionId, newSessionId, checkpointId) -> { id, timestamp } | null
//   clear(sessionId)                               -> void
//   _resetForTests()                               -> void

export {
    createCheckpoint,
    listCheckpoints,
    revertToCheckpoint,
    getCheckpointDiff,
    getCheckpointMessages,
    getCheckpointCount,
} from './checkpoint-store.js'

export { sendDmail, fetchPendingDmail } from './dmail.js'

export { forkSession, clear, _resetForTests } from './session-fork.js'
