# 03-eliminate: gm-runtime-hmr-final-witness

session: mcp-codemode-3535970-1793542718115-1-9
environment at run: no node_modules at /workspace/freddie (workspace packages unlinked); load average 11-12 at 16:31, so no `pnpm install` was run in this shared checkout.

## u2 runtime projection: KNOWN
- expected (from row contract): the GUI gm object carries the runtime leaf values produced by runtimeStatus.
- live JIT: exec_js 1793543442829-742-820bf86255c69696 ran the real gm-progress reducer (packages/gm/gm-progress/src/projection.js). A gm/progress event with runtime {runnerVersion, gmVersion, updateState, updateError} came back with runtime equal to the input (applyReturnsRuntimeEqual=true, stateVersion=4).
- static locate: codesearch 1793543400162-650-fabc15484135298c; tool-gm apply at packages/gm/tool-gm/src/index.js:50 (runtimeStatus), :54 (gmProgressSnapshot), :56 (session.append gm/progress); ObservabilityDock.js:265 reads useProjection('gmProgress'); :182 renders runtimeSummary(gm.runtime).
- resolved via unknown-resolve (dispatch 1793543502630-827-a41ce04580c9c712).

## u4 leaf values (half): OBSERVED, render half OPEN
- expected: gmVersion and runnerVersion are non-null strings, updateState current, no poll errors.
- live JIT: exec_js 1793543382203-605-515ed13c33c74123 called daemon.readStatus('/workspace/freddie') and readDaemonStatus(): runnerVersion 0.1.570, gmVersion 0.1.2143, machine present, staged_runner_awaiting_handoff false, both poll errors null. Matches expected.
- not eliminated: whether Overview renders these (render half needs the ObservabilityDock module, which imports fail to resolve here: exec_js 1793543480200-805-2d3ccda264335f17).

## u1 journal reaches the GUI: OPEN (live delivery not runnable here)
- static locate: framework/hmr/src/index.js:503-508 recordJournal emits hmr/journal; packages/client/hmr/src/index.js:40 HOST_JOURNAL_KINDS = {reload, deferred, failed}; :427-435 publishes host-reloaded for those kinds. codesearch literal 1793543449669-753-2fcd6dc1f72ee4b; hmr/journal literal 1793543350446-541-89accb577a0a4e6c.
- JIT import of framework/hmr/src/index.js failed ERR_MODULE_NOT_FOUND @freddie/cordis (dispatch 1793543456459-768-4781b1b44e18f867). The GUI delivery of a reload-after-idle record needs a live host, not run here.

## u3 idle ordering: OPEN
- static locate: framework/hmr/src/index.js:358-371 partialReload defers on busy and waits for hmr/idle (:365); packages/core/agent-loop/src/index.js:242 emits hmr/idle from ownership.onIdle; :243-247 hmr/before-reload returns a reason while the loop is busy. codesearch 1793543354997-555-70fa4b3a03e5b1af.
- the ordering of idle vs a fresh GUI dispatch is a live-host fact; JIT import blocked (dispatch 1793543456459-768-4781b1b44e18f867).

## u5 sibling dependency: OPEN
- sibling gm-runtime-host-hmr-activation is in-progress (prd_list 1793543234242-314-d9dec8137833c9c6). Its Post (host HMR reload then a live GUI GM call publishing runtime JSON) is the live leg this row needs. Code for the publish exists (tool-gm index.js:50-56), but its live Post was not run here.

## u6 fiber health: OPEN
- no read-only probe reaches a live loader fiber from this lane. JIT import of the ui-observability client failed ERR_MODULE_NOT_FOUND @freddie/freddie-client-ui-slots (dispatch 1793543480200-805-2d3ccda264335f17). Reading the fiber state requires the live host.

## friction recorded
- workspace packages are not linked in this checkout, so every package-level JIT import fails (ERR_MODULE_NOT_FOUND). Recorded for gm: an exec_js preflight that reports unlinked workspace packages would have saved three probes.
- served gm-mcp bundle reports bundle_stale: true (served sha 084e8858... vs installed 3b5c6e55...), with the advisory to reconnect the gm MCP client.
- codesearch store lane starved twice before a successful re-dispatch (see 01-orient.md).
