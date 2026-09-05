# @freddie/freddie-gm-client

Cordis-native access to [gm](https://github.com/AnEntrypoint/gm) (`ctx.gm`): dispatches gm's spool verbs directly against `.gm/exec-spool/`, in-process — the same file-based write/poll cycle [gm-mcp](https://github.com/AnEntrypoint/gm-mcp) wraps behind an MCP stdio server, driven here without that hop.

## Model

- `ctx.gm.call(verb, body, options?)` writes one dispatch to `.gm/exec-spool/in/<verb>/<sessionId>-<N>.txt`, polls `.gm/exec-spool/out/<verb>-<sessionId>-<N>.json` for its `.ready` sentinel, and returns the parsed response — no subprocess, no MCP framing, no network round-trip.
- Boots the shared, machine-wide `agentplug-runner` daemon on first call if it isn't already running (a live `.status.json` with a fresh `ts` and a live `pid`), by calling `~/.gm-tools/bootstrap.js`'s own `startSpoolDaemon()` directly — the exact function gm's own CLI calls, never a second bespoke boot implementation. A `~/.gm-tools` update benefits every consumer this way, this plugin included.
- Deliberately skips `bootstrap.js`'s heavier `ensureReady()` (project-doc "next-step wiring" that rewrites the consuming project's own `CLAUDE.md`/`AGENTS.md`, plus a network version-drift check) — those belong to gm's own CLI install flow, not a lightweight per-activation daemon ping.
- The daemon is `shared_process: true` by design: every project/session on the machine attaches to the same one, stateless-per-call. Multiple `ctx.gm` instances across concurrent sessions share this daemon safely as long as each carries its own `sessionId`.

## Config

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `sessionId` | string | required | gm SESSION_ID for every dispatch from this instance. Every fanned-out subagent that wants its own `ctx.gm` mints its own distinct value (a separate plugin instance/config) — never shares this one's, per gm's own interference-avoidance contract: the daemon keys in-flight claims by the literal `(verb, sessionId-N)` pair with no further partition. |
| `cwd` | string | `process.cwd()` | Project root containing `.gm/exec-spool`. |

## Use

```js
await ctx.plugin(Gm, { sessionId: 'my-app-1', cwd: process.cwd() })

const status = await ctx.gm.call('git_status', {})
const orient = await ctx.gm.call('codesearch', { query: 'session storage backend', mode: 'dual' })
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

- No timeout/retry policy beyond a flat per-call `timeoutMs` (default 120000ms, matching gm's own default) — a caller wanting bounded-retry-then-surface discipline implements it at the call site.
- `ensureDaemon`'s liveness check adds a `process.kill(pid, 0)` probe on top of `.status.json`'s `ts` freshness, closing a real gap found live this session: a daemon killed moments ago still reads "fresh" against a five-minute staleness window if only `ts` is checked, since the status file isn't rewritten on process death.
