## Rationale

- `src/coordinator.js` `session/disposed`: the shutdown marker is captured at the session's own termination edge, then the coordinator's only strong reference is retired. Sessions still adopted at plugin teardown are alive through whole-application teardown, so their marker is captured before the backend quiesces.
- `src/coordinator.js` `session/flush` listener returns `void`, not the SDK flush promise: parallel listeners are awaited by the loop at turn end, so this is the turn-latency contract.
- `src/coordinator.js` replay: containment is per event; one rejected record is withheld fail-closed while the rest of the historical replay proceeds.
- `src/coordinator.js` chunk projection: only the first chunk of each (turn, step) ships as the stream-started signal; content is complete in the step's assembled `assistant/message`. Dropped chunks do not advance the cursor, so re-adoption re-drops them deterministically.
- `src/coordinator.js` body: `structuredClone(event.data)` because the canonical event is mutable and the backend serializes later; append-time validation guarantees the clone cannot throw.
- `src/coordinator.js` severity `default`: no `assertNever` on purpose; event types this coordinator does not depend on (including plugin-merged ones) pass through as `info` and their owners keep their outcome semantics.
- `src/coordinator.js` `session.seed_length`: the durable fork boundary; a forked stream starts there and its prefix lives in the parent's stream, so receivers stitch on (`parent_id`, `seed_length`).
