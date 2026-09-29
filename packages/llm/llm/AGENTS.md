# AGENTS.md — llm

## Rationale

- `src/adapter-failure.js`: cross-package copies of an error keep own data but not class identity, so carried failure facts are trusted only when both own properties (snapshot and code) agree after validation; the last fallback returns a serializable failure beside the original Error.
- `src/assembler.js`: the first block close wins; later re-closes are ignored so streamed output and the final assembled block agree; chunks arriving after `block-end` are stragglers and ignored.
- `src/attribution.js`: the version is read from the package's own `./package.json` (an export of this package) so the User-Agent cannot drift from what is published; the relative path resolves from both `src/` and the bundled `lib/`.
- `src/call-config.js` open item: revisit which `LlmCallConfig` fields are epoch-level for cache reuse and where provider-specific request options belong.
- `src/error.js` cause rendering: the active recursion path (entries removed on exit) flags only true cycles, so a diamond-shared cause renders in full; a cause identical to the message is not repeated (wrappers like `new HarnessError(String(value), code, { cause: value })`). The renderer feeds UI notices and logs, so hostile getters/coercion collapse only their own node to `<unrenderable value>`, never the chain.
- `src/index.js` API-key error text names the Models page as a usual writer, not the only one: the value may come from `.env` or a shell export in a composition with no credentials seam, where pointing at an unserved page is a dead end.
- `src/index.js` `llm/adapters-updated` notification: Cordis `emit` uses `Array.map`, so each listener is contained (sync throws and async rejections) and only INVARIANT-coded failures are rethrown; async rejections cannot reach the synchronous rethrow, so they are logged.
- `src/index.js` `registerAdapter`: `released` is tracked separately from `owned` because `replace([])` legally leaves a live registration holding no routes; `replace` after disposal throws `REGISTRATION_DISPOSED` (registering would leak, nothing remains to release). The `ctx.effect` disposer's promise is discarded (our disposer API is synchronous).
- `src/index.js` model discovery needs a provider route or a `baseURL` (else nothing to describe); capability metadata passes through because an explicit modality omission is a negative capability that downstream preflights (image admission) act on. The stream generator ends its adapter-owned `try` before `yield` so consumer/middleware failures resumed into it stay thrown.
- `src/invariant.js`: a disposer-time emit can outlive the service-store entry during whole-context teardown, so only a live `llm` is checked; a lookup throw after a notification IS the violation.
- `src/retry-policy.js`: layered config can retain normal-mode-only fields after a switch, so `always` mode ignores inactive values but still rejects unknown keys.
