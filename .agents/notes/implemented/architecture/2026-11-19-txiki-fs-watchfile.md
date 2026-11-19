# Agent Note: txiki fs.watchFile and fs.unwatchFile

Status: implemented

## Problem

fs.watchFile and fs.unwatchFile were sync-fs gaps under txiki, although stat polling over tjs.stat can reproduce their listener behaviour.

## Decision

- Both are pure JS: a per-path watcher table, a setInterval poll over tjs.stat, and the same change fields libuv's poller compares (atime is not one of them).
- A missing path reads as zeroed stats, as Node does, so the first event for a missing path is a zeroed event rather than an error.
- Sub-millisecond timestamps are not reproduced because tjs.stat gives millisecond Dates. The shared cases compare integer fields and Dates only, and fs.stat already has the same precision.
- The return value is undefined, not Node's StatWatcher.

## Alternatives considered

- Keep both as gaps until a native watcher exists. Rejected: stat polling is pure JS over an existing API, and Node's listener contract is reproducible.
- Assert the sub-ms mtimeMs difference as a gap. Not taken: the field exists and is correct at millisecond precision, the same as fs.stat.

## Consequences

- The txiki gap list drops fs.watchFile and fs.unwatchFile (47 to 45).
- The parity suite runs 181 shared cases. The five timing-based cases are bounded at 2000 ms and clean up their watchers in a finally block.
