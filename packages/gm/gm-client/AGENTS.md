# @freddie/freddie-gm-client

## Rationale

- `invariant.js` registers a no-op installer: gm-client is a spool dispatcher over `.gm/exec-spool/`, mounts `ctx.gm`, and owns no session events or durable logged relation to check; dispatch counters are process-local, not a reconstructable stream.
- `daemon.js` status and heartbeat reads treat `ENOENT` (not written yet) and `SyntaxError` (partial write) as absent; any other error throws. Liveness probe: `EPERM` means the pid exists but cannot be signaled (alive), `ESRCH` means gone, and Windows Node often omits `ESRCH` for a missing pid, so any other error on win32 means not alive.
- `spool.js` unlinks the response path before dispatch as defense in depth: `processEpoch` makes a collision implausible, but a leftover file (crash and restart within the same millisecond, failed cleanup) must never be mistaken for this dispatch's answer. If the fs watch fails (`EMFILE`, Windows), polling remains the waiter.
