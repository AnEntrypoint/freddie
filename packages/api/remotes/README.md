# @freddie/freddie-api-remotes

Two-sided BFF for Host Remote capabilities selected by this application. The Host entry owns Agent/Session identity policy; the Client entry imports generated `/remote` artifacts as runtime values, mounts each contribution through `ctx.remote.$mount()`, and re-exports their declaration merges. Client business packages depend on this facade rather than the Gateway implementation or individual Remote runtime entries.

`createApiRemoteAgentResolver()` reuses live Agents, resumes ordinary cold sessions, deduplicates concurrent resumes, preserves the subagent ownership fence, and configures the same resolver for Typert `agent` and `session` lookups. The standard Web API Proxy supplies its Agent defaults and scope setup, then uses the returned resolver for legacy methods, so migrated and unmigrated methods share one policy implementation.

The current Client assembly mounts the Goal Remote contribution, the GM graph-edit contribution (`gm/prdAdd` and siblings), the read-only Host plugin inventory contribution (`pluginInventory/list`), and the plugin manager contribution (`pluginManager/describe`, `pluginManager/setDisabled`). GM is loaded with a dynamic import and mounted last: a missing module or `$mount` failure is logged and left absent so commands, goals, and the shell still boot. Cordis effect ownership withdraws every contribution when this assembly unloads, while `@freddie/freddie-api-gateway/client` owns descriptor validation, traced namespace Services, direct and scoped methods, invocation, and cancellation. The Client entry consumes the shared `TypertClientRemote` interface through Cordis and does not import the concrete Gateway. It re-exports the Gateway Client face's declaration merges type-only, so a consumer reaching the forwarded-event vocabulary through this facade gains no runtime edge to the Gateway implementation.

This package contains no transport or Host service discovery logic. Its Client face can be reused by Web or a future TUI that provides the same React-free `ctx.remote` contract.

## Forwarded Host events

`src/remote-events.js` holds `API_REMOTE_FORWARDED_EVENTS`, the allowlist of Host cordis events this application forwards to consumers verbatim — no projection, no redaction, no renaming — and therefore the legal key set of `ctx.remote.$on`. Forwarding one more event is an entry in that array and nothing else: the consumer key face and the Host forwarding loop both derive from it.

The listener signature is not restated here. Each allowlisted event's cordis `Events` shape is documented in its owner package's client-safe `./types` export (`freddie-agent-presets`, `freddie-commands`, `freddie-credentials`, `freddie-llm`, `freddie-settings`), and both faces of this package pull those declarations in, so "forwarded verbatim" holds by construction rather than by proof. There is no separate runtime check that rejects a scoped or non-declared event name — reviewing `API_REMOTE_FORWARDED_EVENTS` entries against each owner package's event vocabulary is the only guard.

## Build boundary

The workspace is buildless plain JavaScript: there is no `tsconfig.json`, no `tsdown`, and no compiled `lib/` output anywhere in the repository. This package ships its source directly through `package.json` `exports` — `.` at `src/index.js`, `./invariant` at `src/invariant.js`, and `./client` at `src/client/index.js` — the same subpath shape any other package with a browser-loaded assembly uses; `api-remotes` needs no separate build-face split to make that work.

`src/remote-events.js` holds `API_REMOTE_FORWARDED_EVENTS`, the single allowlist both the Host forwarding loop and the Client `ctx.remote.$on` key face read; there is no second, generated copy to keep in sync because both sides `import` the one file at runtime.

## Model Experience

None, as this BFF selects Remote application methods and identity policy but registers nothing model-facing.

#### KV Cache effect

No direct effect; mounted Host capabilities own any model-visible behavior they trigger.

## Known Limitations and Deferred Work

- The capability set is fixed by explicit build-time value imports; the Client does not discover the Host's active Services or Remote definitions at runtime.
- Additional capabilities require an explicit `/remote` value import and mount in this assembly.
- The standard Web Host supplies resume defaults and Agent-scope setup from the legacy API Proxy until that remaining BFF configuration moves into `api-remotes`.
