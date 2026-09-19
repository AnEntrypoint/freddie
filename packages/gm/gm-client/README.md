# @freddie/freddie-gm-client

Cordis-native access to [gm](https://github.com/AnEntrypoint/gm) (`ctx.gm`): dispatches gm's spool verbs directly against `.gm/exec-spool/`, in-process — the same file-based write/poll cycle [gm-mcp](https://github.com/AnEntrypoint/gm-mcp) wraps behind an MCP stdio server, driven here without that hop.

## Model

- `ctx.gm.call(verb, body, options?)` writes one dispatch to `.gm/exec-spool/in/<verb>/<sessionId>-<processEpoch>-<N>.txt` via a same-directory rename so the daemon never claims a torn body, then waits on `.gm/exec-spool/out/<verb>-<sessionId>-<processEpoch>-<N>.json`. A non-recursive `fs.watch` on `out/` wakes the waiter when the OS reports a create; a 25ms poll remains the fallback when watch is unavailable or silent. A `.ready` sentinel is accepted when the runner provides one, but a complete JSON response is sufficient: the standalone runner publishes only that atomic response file. The first few waits only check the response before walking the rest of the spool or probing daemon health. After a successful boot, later calls for that same project cwd skip `ensureDaemon` until a `GM_DAEMON_DIED` recovery. `options.cwd` selects the project root for that dispatch (session workspace when a model tool supplies it); otherwise the live `session.header.cwd` wins over config `cwd`, so a GUI host whose `process.cwd()` is the Freddie checkout still boots and dispatches against the open workspace. `processEpoch` is `Date.now()` at module load so a restarted process cannot read a leftover out-file at the same counter. `options.signal` aborts the wait. `ctx.gm.resolveConfig()` / `resolveProse` / `resolveGraph` read already-materialized `gm.config.json` tiers via `@freddie/freddie-gm-config` and never dispatch to the daemon.
- Graph-edit Remotes (`prdAdd`, `prdResolve`, `mutableAdd`, `mutableResolve`, `transition`) bind through `bindTypertRemote(this, 'gm')` and take an `Agent` so `session.header.cwd` is the open workspace. The Client assembly mounts `@freddie/freddie-gm-client/remote` as `ctx.remote.gm`.
- Boots the shared, machine-wide `agentplug-runner` daemon on first call if it isn't already running (a live `.status.json` with a fresh `ts` and a live `pid`), by spawning `~/.gm-tools/agentplug-runner spool` — the same fire-and-forget registration [gm-mcp](https://github.com/AnEntrypoint/gm-mcp) and gm's skill use. That native host loads `gm.wasm` with `host_plugin_call`. The retired JS wrapper at `~/.gm-tools/plugkit-wasm-wrapper.js` does not, so a boot that spawned it never wrote `.status.json` and `ensureDaemon` timed out at 45s.
- The daemon is `shared_process: true` by design: every project/session on the machine attaches to the same one, stateless-per-call. Multiple `ctx.gm` instances across concurrent sessions share this daemon safely as long as each carries its own `sessionId`.

## Config

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `sessionId` | string | required | gm SESSION_ID for every dispatch from this instance. The base bundle derives it per process (`FREDDIE_SESSION_ID` when assigned, otherwise `freddie-<pid>-<epoch>`), never a shared literal, so two concurrent Freddie processes against the same project do not race one gm session. Every fanned-out subagent that wants its own `ctx.gm` mints its own distinct value (a separate plugin instance/config) — never shares this one's, per gm's own interference-avoidance contract: the daemon keys in-flight claims by the literal `(verb, sessionId-processEpoch-N)` pair with no further partition. |
| `cwd` | string | `process.cwd()` | Fallback project root containing `.gm/exec-spool` when a call does not pass `options.cwd`. Model-facing tools pass the session header cwd (the open workspace), so a GUI host whose `process.cwd()` is the Freddie checkout still dispatches against the workspace's own spool. |

## Use

```js
await ctx.plugin(Gm, { sessionId: 'my-app-1', cwd: process.cwd() })

const status = await ctx.gm.call('git_status', {})
const orient = await ctx.gm.call('codesearch', { query: 'session storage backend', mode: 'literal' })
```

## Model Experience

### Stored domain records

#### What the model sees

Nothing directly. This package contributes no prompt, tool, or schema of its own — it's infrastructure a consuming tool/plugin calls into.

#### Token effect

Zero live-request tokens from this package itself; a tool built on top of `ctx.gm` shapes its own token cost from what it dispatches.

#### KV Cache effect

None — the plugin never touches live request prefixes.

## Known Limitations and Deferred Work

- No timeout/retry policy beyond a flat per-call `timeoutMs` (default 120000ms, matching gm's own default) — a caller wanting bounded-retry-then-surface discipline implements it at the call site. Abort throws immediately. When the daemon dies, the client restores readiness and replays the unresolved dispatch once. A hung daemon remains a `GmDaemonUnavailableError` with `code` `GM_DAEMON_HUNG`; it is not replayed because its original outcome is still indeterminate.
- `ensureDaemon`'s liveness check adds a `process.kill(pid, 0)` probe on top of `.status.json`'s `ts` freshness, closing a real gap found live this session: a daemon killed moments ago still reads "fresh" against a five-minute staleness window if only `ts` is checked, since the status file isn't rewritten on process death. A recorded pid that still answers `kill(pid, 0)` is alive even when `ts` is older than five minutes — a frozen ticker is hung, not dead. A pid that is still alive but whose project `ts` has not moved for four minutes is hung, unless `busy_until` is a number in the future — that licenses waiting, never a death declaration. A claimed `.inflight` or unclaimed `.txt` under `.gm/exec-spool/in/` also licenses waiting: the 3s project ticker can rewrite `.status.json` without `busy_until` while a long codesearch is still claimed, and aborting that wait is what trips `long-gap-no-instruction` on the next verb. Hung errors name `project-heartbeat-stale` when `~/.agentplug/daemon-status.json` (or `AGENTPLUG_HOME/daemon-status.json`) is still fresh, versus `daemon-status-stale` when the machine-wide heartbeat is also stale. A healthy runner can go more than a minute between project `.status.json` heartbeats; sixty seconds was a false positive against that cadence.
- The shared daemon's live stderr is `~/.agentplug/daemon.log` (or `$AGENTPLUG_HOME/daemon.log`). pid 25588 this session appends there (`compiling bert.wasm`, cold-project sweep, auto-detach). Set `AGENTPLUG_HOME` to isolate a local runner without replacing the machine-wide process.
- `instruction.codeinsight_overview` this session reports `file_count=220` / `symbol_count=268` for this repo (`digest v3:697ee2011c75d002:files=485`). That is a truncated treesitter/codeinsight index, not git-tracked source completeness. Prefer known-path Read/`exec_js` over dual codesearch for files the overview does not name.
