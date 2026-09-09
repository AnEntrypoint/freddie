# Agent Note: Inflight codesearch must not abort waiters as hung

Status: implemented

## Problem

A dual-mode `codesearch` on this machine stays `.inflight` for four to five minutes. `dispatch_project` writes `busy_until` every 5s only while it still holds the worker join handle, then auto-detaches at 45s (`WORKER_AUTO_DETACH_AFTER_MS`). The 3s `spawn_project_heartbeat_ticker` then rewrites `.status.json` with `busy_until: None`, so `gm-client` `isDaemonHung` throws `project-heartbeat-stale` after `HUNG_MS` (4 min) even though the wasm dispatch is still running. Queued `instruction` / `phase-status` abort; the next verb is denied `long-gap-no-instruction`. Live this session: codesearch 61/64/67, instruction-66 hung-throw, codesearch-62/65 long-gap.

## Decision

Two complementary waits, not a substitute for a live ticker.

`packages/gm/gm-client/src/spool.js` `dispatch()` throws hung only when `isDaemonHung` is true **and** the project has no `.inflight` / unclaimed `.txt` under `.gm/exec-spool/in/`. The died throw is the same conjunction against `isDaemonAlive`. Queued work licenses polling until `timeoutMs` or `signal`. `isDaemonAlive` treats a `kill(pid, 0)` success as alive even when `.status.json` `ts` is older than five minutes — a frozen ticker is hung, not dead.

`C:\dev\gm\agentplug` (local, not vendored here) `spawn_project_heartbeat_ticker` preserves a still-future `busy_until` and extends it by 60s while spool in-files exist. Auto-detach writes that same extension instead of dropping the wait-license. Queue-info heartbeats preserve a future `busy_until` rather than passing `None`. Verification of the runner change uses `AGENTPLUG_HOME`; the shared daemon pid is never killed. Push to AnEntrypoint still needs explicit go-ahead ([contribution path](../process/2026-09-07-gm-upstream-contribution-path.md)).

## Alternatives considered

**Only raise `HUNG_MS`.** Rejected: a 4-minute codesearch would still lose to a longer one, and a genuinely dead ticker would wait longer.

**Only `busy_until` on the daemon, no client inflight check.** Rejected: the 3s ticker was already clobbering `busy_until` with `None`; a client that trusts only that field still hung-throws on today's runner.

**Kill and respawn the shared daemon to pick up the ticker fix.** Rejected: `shared_process: true`, three `active_projects`. World-scope.

## Consequences

A waiter behind a long codesearch now either finishes the spool JSON or hits `timeoutMs`, never a hung Error that then trips long-gap. The machine-wide runner does not pick up the ticker preserve until a later isolated or owned restart. `gm_scan_deps` is a twelfth `tool-gm` definition; this session's already-booted plugin table still has eleven until the host reloads.
