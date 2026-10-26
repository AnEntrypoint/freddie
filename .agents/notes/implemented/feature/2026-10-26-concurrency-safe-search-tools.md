# Agent Note: Concurrency-safe grep and glob

Status: implemented

## Problem

A tool without an `isConcurrencySafe` classifier, or whose classifier does not return exactly `true` for the call's arguments, is an exclusive barrier (`executionMode` in `packages/core/tools/src/index.js`). `grep` and `glob` declared no classifier, so a model round that asked for several searches ran them one after another. The tool-call scheduler already overlaps safe calls (`read` declares `isConcurrencySafe: () => true`), so the serial cost was the declaration, not the scheduler.

## Decision

`grep` (`packages/fs/tool-fs-search/src/grep.js`) and `glob` (`packages/fs/tool-fs-search/src/glob.js`) declare `isConcurrencySafe: () => true`, matching `read`. Both only read the workspace. The scheduler still commits results in model order, so the model-visible tool messages do not change. Invalid arguments fail the classifier's validation and stay exclusive.

## Evidence

Live runs against a loopback OpenAI-compatible endpoint that returns three calls in one round (`FAKE_CALLS=3`), driven through the real headless entry. Per-call start and result times are read from the session log.

- grep before, two runs: starts 0/136/194 ms and 0/96/143 ms; round wall time 241 ms and 188 ms; at most one call in flight.
- grep after, two runs: starts 0/16/32 ms and 0/2/4 ms; round wall time 213 ms and 126 ms; all three calls in flight together.
- grep result hash (sha256 of the tool-role messages in the second request) is `fce96787d9fe143f` before and after.
- glob after: starts 0/11/25 ms, overlapping. glob has no serial baseline measured.

## Limits

The box is shared with other lanes, so the timing is noisy. Across two runs each the mean round time fell about 21 %; the counted unit is clearer: maximum concurrent tool executions per round went from 1 to 3.

Not changed: the first step's `preStep` (system-prompt assembly and the `agent/pre-step` waterfall) cost 336–911 ms per turn across six baseline runs before the model request. Single-listener ablation did not isolate it under this noise, so it remains the largest unattributed local serial term.
