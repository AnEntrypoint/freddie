# Agent Note: browser-use-chrome-devtools-mcp provider

Status: implemented

## Problem

freddie's `ctx.browserUse` slot had no provider. With the shared runtime ported (`2026-09-28-browser-use-runtime.md`), the remaining piece is a real provider that fills the slot and exposes upstream tools as `mcp__chrome-devtools-mcp__<tool>`.

## Decision

**Port `experimental/browser-use-chrome-devtools-mcp` and prefer it over the redundant `browser-use-playwright-mcp` sibling**, per the task. Source read from `raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/experimental/browser-use-chrome-devtools-mcp/`.

## Port

New package `packages/experimental/browser-use-chrome-devtools-mcp` (`@freddie/freddie-experimental-browser-use-chrome-devtools-mcp`), private, buildless plain JS + JSDoc.

- `src/index.js` — Cordis plugin (`name`/`inject`/`Config`/`apply`), `inject = ['browserUse','agents','tools','systemPrompt']`; `Config` is `Schema.intersect([BrowserMcpConfig, Schema.object({ entryPath })])`; `apply` validates config, resolves the server entry, builds argv, and calls `mountSessionMcp(ctx, { name: 'chrome-devtools-mcp', exclusive: config.mode === 'attach', command: process.execPath, args })`.
- Launch mode: `--isolated --headless=<bool>` (+ optional `--executable-path`). Attach mode: `--browser-url` or `--ws-endpoint` for `wss?:`. Always `--no-usage-statistics`.
- `PINNED_SERVER_VERSION = '1.9.0'`, entry `chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js`.
- `src/invariant.js` — explained empty installer.

### Dependency posture (the one thing to review)

**No `chrome-devtools-mcp` dependency was declared.** Per the task's dependency rule, new dependencies get named and vetted before landing, so the port resolves the pinned entry at launch instead: `import.meta.resolve(SERVER_ENTRY)` → `fileURLToPath`, or an explicit `entryPath` Config field (validated with `existsSync`). When resolution fails the error is actionable and names the version:

```
chrome-devtools-mcp@1.9.0 is not installed next to this package; install it out of band or set `entryPath` to its build/src/bin/chrome-devtools-mcp.js
```

Flagged for vetting: `chrome-devtools-mcp@1.9.0` — **requested as an out-of-band install, not added to any manifest.** `pnpm-workspace.yaml` `allowBuilds` untouched. Nothing third-party enters the tree at install time and the child fetches or executes no remote code.

### Security

The child runs under `process.execPath` (the current Node executable, no shell) and receives **only** the MCP client's scrubbed ambient environment — this provider supplies no `env` overrides, so no `FREDDIE_*` var and no name matching `/KEY|PASSWORD|SECRET|TOKEN/i` reaches it. `failOnStartupError: true`, `reconnect: { enabled: false }`: if the driver cannot start the activation fails loudly and exposes no tools.

## Alternatives considered

**Declaring the dependency** — rejected: the task forbids adding one unvetted. **Runtime-resolving a floating `latest`** — rejected: the entry is pinned to `1.9.0` and the error names that version. **Porting playwright too** — rejected as redundant sibling; the runtime seam makes a second driver a pure addition, not a prerequisite.

## Consequences

Verified live against real objects. Starting real Chromium was not possible in this environment, so the driver was stood in for by a real JSON-RPC MCP stdio server launched through the shipped provider code — everything up to the process boundary is real:

- 5 invalid configs rejected; missing entry throws `chrome-devtools-mcp@1.9.0 is not installed next to this package; …`; absent `entryPath` throws `… does not exist …`
- `ctx.browserUse.providerName : chrome-devtools-mcp`; discovered `["mcp__chrome-devtools-mcp__click","mcp__chrome-devtools-mcp__argv","mcp__chrome-devtools-mcp__envprobe"]`
- `child argv : ["--no-usage-statistics","--isolated","--headless=true"]`
- `child env probe : {"seesSecretToken":false,"seesFreddieMarker":false,"hasPath":true}` while the parent process saw both markers — env scrubbing proven at the process boundary
- disposal → `providerName : undefined` and per-Agent catalog `[]`

`node scripts/publint-all.js` clean for both new packages.
