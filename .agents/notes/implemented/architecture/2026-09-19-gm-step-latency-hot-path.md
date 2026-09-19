# Agent Note: GM/tool/step latency hot path

Status: implemented

## Problem

Every Freddie GM tool call and every idle-to-claim daemon tick paid a 200ms sleep quantum. `gm_codesearch` omitted `mode`, so the daemon defaulted to `dual` (minutes of embed) instead of `literal` (~1s). Session persistence's 200ms write batch does not sit on the LLM step path because `session/flush` cancels it. acptoapi happy-path TTFB already had no extra sleep; a dead wait loop after an early return was a landmine.

Live baseline this session (daemon pid 23100, `queue_wait_ms` 16, `claimed_step_count` 1): `exec_js` 73ms while busy; `git_status`/`phase-status` ~500ms. Idle 200ms is the idle-to-claim floor, not the busy-path floor.

## Decision

Freddie spool wait uses a non-recursive `fs.watch` on `.gm/exec-spool/out/` with a 25ms poll fallback. After a successful boot, `Gm.call` skips `ensureDaemon` until a `GM_DAEMON_DIED` recovery. `gm_codesearch` forwards `mode: 'literal'` when omitted and passes `path`/`glob`. The agentplug daemon idle tick and nested plugin-dispatch poll are 25ms. acptoapi `waitForLeadLinkPrecheck` remains a single `preCheck` plus last-link `sampler_backoff` force-through; the unreachable wait loop is gone.

`session/flush` already cancels `writeBatchMaxDelayMs` before model requests; that path is unchanged.

## Alternatives considered

**Add a notify crate to the daemon.** Lost: exhaustive `notify =` in `C:\dev\gm` is zero matches; a new dep plus Windows watch flakiness for a 175ms floor cut. Shorter idle sleep ships without a crate.

**Keep 200ms idle sleep and only watch on the Freddie side.** Lost: an in-file that arrives during daemon idle still waits the remainder. The 25ms tick is the claim-side half of the same cut.

**Require the model to pass `mode: 'literal'`.** Lost: omitted mode is the common path and defaulted to dual.

## Consequences

Cheap verbs after idle can land in one 25ms quantum plus watch wake instead of 200ms. Unspecified codesearch is a tree walk, not an embed pass. Dual remains available when requested. The running agentplug binary still sleeps 200ms until rebuilt and self-updated; source is the cut. Hung/died detection still runs after five polls; queued `.inflight` still licenses waiting.

## Verification

`packages/gm/gm-client/src/spool.js` `DEFAULT_POLL_INTERVAL_MS` 25 and `waitForOutOrTimeout`. `packages/gm/gm-client/src/index.js` skips `ensureDaemon` when `this.booted`. `packages/gm/tool-gm/src/verbs.js` `toBody` sets `mode: args.mode ?? 'literal'`. `C:\dev\gm\agentplug\crates\agentplug-runner\src\daemon.rs` idle sleep 25 and `PLUGIN_DISPATCH_POLL_MS` 25. `C:\dev\acptoapi\lib\chain-machine.js` `waitForLeadLinkPrecheck` returns after one `preCheck`.
