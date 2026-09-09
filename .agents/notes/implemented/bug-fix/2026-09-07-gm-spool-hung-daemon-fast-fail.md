# Agent Note: Hung gm daemon fails a spool poll immediately

Status: implemented

## Problem

`isDaemonAlive` treated a live pid with a fresh-enough `.status.json` `ts` as healthy. A runner that stopped consuming the spool (pid still exists, `ts` frozen) then made every `gm_*` call wait the full 120s timeout. Live this walk: pid 19400 stayed in the process table while `.status.json` `ts` stopped moving, and `gm_transition` / `gm_instruction` timed out at 120000ms.

## Decision

`isDaemonHung` is true when `ts` is older than four minutes and the pid is still alive. `dispatch()` throws that as `daemon hung` before waiting the remaining timeout. After the five-minute stale window, `isDaemonAlive` is already false and the existing `daemon died` throw covers it.

## Alternatives considered

**Kill the machine-wide daemon from the harness.** Rejected: other projects share that process; a hung-status throw is enough for the caller to stop waiting.

**Treat any stale `ts` as death even with a live pid.** Incomplete: a busy but healthy daemon can go more than a minute between heartbeats; four minutes is the hung threshold, five minutes remains the dead-status window. A sixty-second hung window was a false positive against that cadence.

## Consequences

A dispatch against a hung daemon fails in milliseconds. The in-file may still sit in the spool until the runner recovers. Callers must not assume the verb ran.
