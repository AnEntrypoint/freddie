# AGENTS.md — code-runtime-worker-thread

## Rationale

- `execute` spawns the worker with `env: {}` (model code gets no ambient environment, stricter than the scrubbed environment used for spawned commands) and `execArgv: []` (otherwise the worker inherits the host's loader hooks from a test runner or `tsx`, which an empty-environment isolate cannot satisfy).
- `bootstrap.js` `captureStreamWrites` routes JS-level `stdout`/`stderr` writes into the ordered log buffer. The `stdout: true` / `stderr: true` pipes in `execute` are only a backstop: native-level writes arriving there are appended after the done logs (`strayLogs`).
- Pipe delivery and message-port delivery are independent. `captureStray` keeps bounded capture going after a terminal message, and `finish` calls `yieldToPollPhase` before `worker.terminate()` so already-queued pipe bytes are delivered; the result is materialized only after termination and both pipe drains complete.
- `onCall` treats the worker as a hostile peer: a duplicate call id is ignored, an unknown name gets a failure reply, and a throwing or rejecting binding becomes a program-side rejection, never a host crash. `ownDeclaredFunction` uses an own-property lookup so a forged name such as `constructor` or `hasOwnProperty` cannot reach an inherited callable. Replies carry values snapshotted as lossless JSON, so they are structured-cloneable.
- The compute budget (`eluTimer`) reads the worker's own measured event-loop busy time, so a hot loop expires it whatever dispatches are in flight, while a program idling on a slow binding accrues nothing. `maxWallMs` is capped at `MAX_TIMER_DELAY_MS` because `setTimeout` clamps a longer delay to 1 ms and would time the run out immediately.
