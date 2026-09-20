# Agent Note: GM/tool/step latency hot path

Status: implemented

## Problem

Every Freddie GM tool call and every idle-to-claim daemon tick paid a 200ms sleep quantum. `gm_codesearch` omitted `mode`, so the daemon defaulted to `dual` (minutes of embed) instead of `literal` (~1s). Session persistence's 200ms write batch does not sit on the LLM step path because `session/flush` cancels it. acptoapi happy-path TTFB already had no extra sleep; a dead wait loop after an early return was a landmine.

Live baseline this session (daemon pid 23100, `queue_wait_ms` 16, `claimed_step_count` 1): `exec_js` 73ms while busy; `git_status`/`phase-status` ~500ms. Idle 200ms is the idle-to-claim floor, not the busy-path floor.

## Decision

Freddie spool wait arms `fs.watch` on `.gm/exec-spool/out/` before the next `takeResponse`, then falls back to a 25ms timer. After a successful boot, `Gm.call` skips `ensureDaemon` for that project cwd until a `GM_DAEMON_DIED` recovery. A `codesearch` body that omits `mode` is sent as `literal`. The agentplug daemon idle tick re-scans `in/` then, on Windows, waits on `FindFirstChangeNotificationW` with a 25ms cap. Claim accepts a non-empty in-file immediately (empty torn writes still refused). Nested plugin-dispatch poll is 25ms and is not the Freddie exec-spool path. A freshly spawned daemon polls GitHub for a runner on the first loop tick; default `runner_update_poll_interval_secs` is 60. Project heartbeat drops `runner_update_in_progress` when no `.new` binary is staged. acptoapi `waitForLeadLinkPrecheck` is one `preCheck` plus lead `sampler_backoff` force-through; the unreachable wait loop is gone.

`session/flush` already cancels `writeBatchMaxDelayMs` before model requests; that path is unchanged.

## Alternatives considered

**Add a notify crate to the daemon.** Lost: exhaustive `notify =` in `C:\dev\gm` is zero matches; a new dep plus Windows watch flakiness for a 175ms floor cut. Shorter idle sleep ships without a crate.

**Keep 200ms idle sleep and only watch on the Freddie side.** Lost: an in-file that arrives during daemon idle still waits the remainder. The 25ms tick is the claim-side half of the same cut.

**Require the model to pass `mode: 'literal'`.** Lost: omitted mode is the common path and defaulted to dual.

## Consequences

Live runner 0.1.144: `exec_js` 73ms, `queue_wait_ms` 0, sticky update flags omitted. Unspecified codesearch from `Gm.call` or `gm_codesearch` is a tree walk. Hung/died detection still runs after five polls; queued `.inflight` still licenses waiting.

## Verification

`packages/gm/gm-client/src/spool.js` `DEFAULT_POLL_INTERVAL_MS` 25 and `waitForOutOrTimeout`. `packages/gm/gm-client/src/index.js` skips `ensureDaemon` per cwd in `bootedCwds` and pins omitted codesearch `mode` to `literal`. `packages/gm/tool-gm/src/verbs.js` `toBody` sets `mode: args.mode ?? 'literal'`. `C:\dev\gm\agentplug\crates\agentplug-runner\src\daemon.rs` idle in-dir wake, first-tick runner poll, heartbeat else-remove of `runner_update_*`. Live `.status.json` `runner_version` 0.1.144 with no `runner_update_in_progress`. `C:\dev\acptoapi\lib\chain-machine.js` `waitForLeadLinkPrecheck` returns after one `preCheck`.
