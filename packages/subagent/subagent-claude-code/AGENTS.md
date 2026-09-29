## Rationale

- `src/process.js` `events.on('error', () => {})`: `EventEmitter` throws on `error` without a listener. The SDK attaches its own listener synchronously after the custom spawn returns; this no-op also contains an already-rejected spawn handle.
- `src/run.js` diagnostics: host diagnostic logging failure must not replace the product failure. Startup cleanup awaits one `Promise.resolve()` so `child.done` can publish a concurrently observed exit before classification. Rethrow keeps the SDK failure category and cause (`ClaudeCodeFailure`); `prependFailureDiagnostic` only adds later process facts.
