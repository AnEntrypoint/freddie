## Rationale

- `src/recorder.js` writes the assistant message when the first custom tool of a batch is about to run, never at `tool_start`: every `tool_start` of one model message arrives before its first `execute`, and flushing earlier would drop later calls of a parallel batch from the logged message.
- `src/engine.js` duplicates the chunk and message recording of `agent-loop/src/agent.js` `step` instead of sharing it, so the native path is untouched while the engine has no real fx to run against.
