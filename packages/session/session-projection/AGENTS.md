## Rationale

- `src/index.js` late cell build mid-stream: history before the current event is folded first via `session.events.slice(0, event.seq)`; this is exact because `seq` equals the log index. The normal change gate then runs.
