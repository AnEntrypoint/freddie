# 01-orient: gm-runtime-hmr-final-witness

session: mcp-codemode-3535970-1793542718115-1-9
row status at read: in-progress (route_family observability, origin session freddie-2128598-1790941468204)
dispatch ids: prd-list 1793542828202-27-301b985924c0859d; codesearch dual 1793543167084-211-6edd991b4a84f4b6, 1793543217486-273-da862ba36545fc4c; callers runtimeSummary 1793543186484-230-b4042fb6605a7c73; impact FreddieObservabilityDock 1793543186435-229-13f4738bb0273644; callers runtimeStatus 1793543224842-287-15fafa7abd6f25e1; callers partialReload 1793543225419-290-3f5b0f2a4003a6bb; callers recordJournal 1793543236010-317-7433689dc2af5b2d

## acceptance (row text, not derived)
The active HMR journal records reload after idle, then a fresh GUI GM tool dispatch reaches an Overview whose GM runtime metric shows the active daemon's leaf values.

subject (pre/invariant/post): Pre: the active HMR queue has a stashed GM source set. Invariant: host plugin reload and the subsequent model tool dispatch remain separated by the HMR idle boundary. Post: the client sees the existing session projection update and retains a healthy active ui-observability fiber.

## symbols and cited locations
- framework/hmr/src/index.js:199-201 `reload = joinQueue(partialReload)` debounced; callers of partialReload are :199 and :223.
- framework/hmr/src/index.js:218-223 stashes a changed loaded url, `recordJournal({kind: external-change|module-change})`, then `partialReload()`.
- framework/hmr/src/index.js:226-227 unhandled change emits `hmr/change` and journals `unhandled-change`.
- framework/hmr/src/index.js:358-371 `partialReload`: `ctx.serial('hmr/before-reload')` busy path journals `deferred` and waits on `hmr/idle` (:365-368) to call `reload()`.
- framework/hmr/src/index.js:503-508 `recordJournal`: ring of 50, emits `hmr/journal`.
- framework/hmr/src/index.js:510-515 `snapshot()` returns `{deferred, stashed, events}`.
- recordJournal callers: :219, :227, :364, :449, :494, :499.
- packages/gm/gm-client/src/index.js:116-132 `runtimeStatus(cwd)` returns `{runnerVersion, gmVersion, updateState, updateError}` from readStatus + readDaemonStatus; sole caller packages/gm/tool-gm/src/index.js:50 (`apply`).
- packages/client/ui-observability/src/client/ObservabilityDock.js:48-52 `runtimeSummary`; :54-59 `runtimeDetail`.
- packages/client/ui-observability/src/client/ObservabilityDock.js:175-186 `#orchestrationSummary(gm, workflow, goal)`; :182 is the "GM runtime" metric (`runtimeSummary(gm?.runtime)`). The only caller of runtimeSummary is :182.
- packages/client/ui-observability/src/client/ObservabilityDock.js:61 class FreddieObservabilityDock; :262 `#render`.
- packages/client/ui-observability/src/client/index.js:6-7 `apply(ctx)`, `gmRemote = ctx.get('remote.gm')`; :34-44 mutableAdd, mutableResolve, transition forwarders.
- packages/client/connection/src/client/fixture.js:824 `projectionValuesOf`; :851 `projectionFramesOf` (gm/progress).
- packages/client/hmr/src/client/index.js:246 terminal recovery reload; :290 client reload queue (remount on failure).

## sibling row (dependency, not a blocker)
gm-runtime-host-hmr-activation (in-progress, execution, same session origin): its Post requires host HMR reload and a real GUI GM tool call publishing runtime JSON so Overview shows the GM version and runner. This row's live witness rides on that path.

## facts the row relies on (each becomes an unknown in 02-unknowns)
- F1: the journal events `deferred` and `external-change`/`module-change` are reachable from the GUI-observable side after reload (Hmr.snapshot is not yet shown to reach the client).
- F2: the `gm` object passed to #orchestrationSummary carries a `runtime` field shaped as runtimeStatus output; the projection path that fills it is not yet located.
- F3: the `hmr/idle` edge fires after the idle boundary and before the next tool dispatch; the ordering with a fresh GUI GM tool dispatch is not yet executed.
- F4: "active daemon's leaf values" equals readStatus/readDaemonStatus output for the active daemon (runnerVersion, gmVersion); the reading path on the live host is not yet executed.

## friction observed
- codesearch store lane starved twice (error dispatch_starved_waiting_for_serial_lane, 120 s each); the third byte-identical re-dispatch returned. Recorded for gm, no action taken.
- codeinsight `impact` refuses a `path` scope field ("impact does not support scope fields path"); callers accepts it.
