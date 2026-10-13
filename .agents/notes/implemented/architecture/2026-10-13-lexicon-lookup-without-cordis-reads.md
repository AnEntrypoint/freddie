# Lexicon lookup without Cordis reads per token

## Decision

`InputHub` (`packages/client/ui-conversation/src/client/input/hub.js`) no longer resolves `inputTriggers` through `rootCtx.get` on every read. `apply.js` binds the trigger service once through a Cordis inject fiber:

- `ctx.inject(['inputTriggers'], scope => …)` calls `inputHub.bindTriggers(service)`; the fiber's effect calls `unbindTriggers(service)` on dispose.
- `controller(actx)` returns the cached `InputTriggerController` for `actx` from a `WeakMap`, and calls `service.sessionOf(actx)` only on a miss or when the cached controller reports `disposed`.
- `InputTriggerController` exposes a read-only `disposed` getter (`packages/client/ui-input-trigger/src/client/controller.js`).

## Why it is HMR-correct

A reload of the trigger service disposes its fiber, so the inject fiber re-runs with the new instance. `bindTriggers` installs the new service and replaces the `WeakMap`, so no controller from the old service survives. `unbindTriggers` ignores a stale fiber whose service is no longer bound. Between dispose and re-bind `triggers` is `undefined`, so reads return `undefined` as the old `rootCtx.get` path did when the service was inactive.

## Measured

- `stream-bench` (400 messages, 200 tokens, 16 ms): the app boots and `newestUserVisible` is true. The only errors are the three fixture RPC errors that appear without the change.
- `drag-bench`: no errors.
- `topCordisCallersMsPerToken` did not move: `getSnapshot facade.js` 0.084 ms/token before and after. `sessions service.js:56` fell 0.054 to 0.028, which is within run-to-run noise.
- Instrumentation (a temporary counter, removed) showed that `InputHub.controller` and `lexicon.getSnapshot` are never invoked during the stream bench. The bench does not exercise the input lexicon, so the reported Cordis attribution cannot be a lexicon read in that run. The change is a strict reduction in Cordis reads on keystroke-driven lexicon reads; it is unproven on that path.

## Open

- Remaining per-call `sessionOf` comes from the `conversation.input.overlay` slot inject in `packages/client/ui-input-trigger/src/client/index.js` (line 27), which calls `inputTriggers.sessionOf(actx)` on each slot resolution. That path needs its own cache, and it is the likely source of the residual `sessions` cost.
- Benchmarks resolve the server through the shared profile at `~/.freddie/profiles/node_modules/@freddie`, which links to another worktree, and they bind port 3080 and CDP 9333 shared with other agents. Worktree benches need `pnpm install` in the worktree and a free port (the variant scripts used 3090 and 9343).
