# @freddie/freddie-tool-gm

## Rationale

- `invariant.js` registers a no-op installer: each successful model-tool dispatch appends exactly one log-only `gm/progress` snapshot after the daemon response commits, and the session append boundary is authoritative and contains malformed durable payloads.
- `gm_exec_js` dispatches through `gm.call`'s `rawBody` option because `exec_js` is a plain-text-body verb (gm-mcp's `PLAIN_TEXT_BODY_VERBS`), not the JSON-body shape `jsonTool` builds.
- Tool `verb` is the real spool verb, never derived from the tool name (`prd-add` vs `git_finalize`). Session id is fixed on the `Gm` instance, cwd is per-call (`exec.agent.session.header.cwd`). `gm` is closed over from `apply(ctx)` because `exec` carries no Cordis context.
- `gm/progress` is an ignorable last-wins session event: `{verb, status, phase, prdPendingCount, mutablesPendingCount, sessionId, belongsToConfiguredSession, startedAt, finishedAt, durationMs, error, nodes, edges, walking}`; graph refreshes from instruction lists unless truncated; prd/mutable add/resolve bodies upsert even when only `{added}`/`{resolved}`.
- Presenters are pure over args/result so old logs fall back to the generic card. Budgets: live dual-index codesearch takes 4-5 minutes; scan_deps walks tracked source plus node_modules.
