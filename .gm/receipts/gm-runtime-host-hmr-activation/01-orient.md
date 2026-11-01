# 01-orient: gm-runtime-host-hmr-activation

session: mcp-codemode-3535970-1793542718115-1-8
row status: in-progress, prior claim freddie-2128598-1790941468204 (stamp 2026-10-02, stale). No other live pool lane claims this row (checked .gm/pool/*.live at orient).

## acceptance (from row, not derived)
The active HMR journal records reload after idle, then a fresh GUI GM tool dispatch reaches an Overview whose GM runtime metric shows the active daemon's leaf values.
Row pre: active Web Host staged modified GM source via the Cordis HMR queue, disposal deferred while the agent loop runs. Post: after reload, a GUI GM call publishes runtime JSON and Overview renders GM 0.1.1362, runner 0.1.158, updater state.

## symbols and call edges (codeinsight; index_current=false, symbol store busy under daemon pid 3210559, so edges are cached-graph answers)
- Hmr.partialReload framework/hmr/src/index.js:358-371: defers when ctx.serial('hmr/before-reload') is busy; registers ctx.on('hmr/idle') at :365; journals kind 'deferred'.
- Hmr.stopDeferring :352-356. Callers: :166 (Service.init), :366, :372.
- partialReload callers: :199 (joinQueue reload), :223 (onChange).
- Hmr.recordJournal :503-508 (in-memory, last 50, emits hmr/journal). Hmr.snapshot :510-516 returns {deferred, stashed, events}.
- Idle emitter: packages/core/agent-loop/src/index.js:242 (ownership.onIdle emits hmr/idle, busy-to-idle edge only).
- Contract text: framework/hmr/AGENTS.md:6.

## located evidence (cited, not re-run here)
- .gm/mutables.yml:2636-2643 precondition witnessed: four GM sources stashed as module-change, reload deferred with reason "agent loop is running 1 turn(s)".
- .gm/mutables.yml:2652-2661 gm-runtime-hmr-idle-postcondition status unknown, blockedBy external: the prior idle reload needs the original host snapshot and journal.
- packages/gm/tool-gm/src/index.js last changed in f2edb0fc (2026-10-02, feat: project GM runtime update state into overview). Working tree clean for this path and framework/hmr/src/index.js.
- Projection note: .agents/notes/implemented/feature/2026-10-02-gm-runtime-update-projection.md.
- Overview consumers (located only): packages/client/ui-observability/src/client/ObservabilityDock.js:232,262; gmProgressValueOf at packages/client/connection/src/client/fixture.js:815.

## search
codesearch dual (k=20): ranked hits 20 vector / 16 bm25 rows / 20 commits, top files framework/hmr/src/index.js, packages/client/hmr/src/client/index.js, packages/client/ui-observability/src/client/ObservabilityDock.js. bm25 group reported skipped (route_without_index). literal scans for hmr/idle, runtimeStatus, inspect_host_hmr were partial (exhaustive false).

## facts the row relies on
F1: deferral is intended lifecycle; reload resumes only on hmr/idle (framework/hmr/src/index.js:365-368, emitter packages/core/agent-loop/src/index.js:242).
F2: the row names no code file. Its code change is already committed (f2edb0fc). The open part is a live host reload and GUI witness, so the edit stage may be a no-op.
F3: the prior postcondition is marked external: the current browser journal is bounded to its connection event.
