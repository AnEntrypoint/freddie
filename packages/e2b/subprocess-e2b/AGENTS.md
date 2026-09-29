# @freddie/freddie-subprocess-e2b

## Rationale

- `process.js` publication: a same-UID sandbox process can rewrite the pid file, so ids `<= 1` are refused (`kill -- -1` would address every process, 1 is init's group).
- `rollbackUnpublishedGroup`: the bootstrap ends in an exec chain through the scrubbed environment and `setsid`, so E2B's command PID is the provisional group id before the publication file can be trusted; kill that group, then prove no member survived before rejecting startup.
- Cleanup proof: TERM delivery/observation failures cannot prove exit, and SDK kill and group kill are independent paths; only the final liveness probe (`waitForGroupExit`) proves cleanup.
- The state directory is marked owned before `makeDir`: a cancellation racing a committed creation must still enter cleanup (removal tolerates an absent path). Private spill/state removal failures are swallowed (owner teardown bounds residue); the command outcome is authoritative.
- After the output drain grace expires, `outputReleased` aborts inherited-output waits so a callback blocked on host backpressure cannot keep the disconnected SDK settlement pending.
- `terminal.js`: the PTY leader is also the provisional POSIX session leader, so its PID stays usable after the session lookup fails or is canceled. `inputWaiting` is always `false`: E2B has process-table commands but no `/proc` memory access to prove a syscall waits on fd 0.
- `process.js` batch stdin is best-effort (as in the local adapter); exit and output stay authoritative. A relative resolved executable comes from a relative PATH entry (lookup ran in the shared cwd) and is resolved against `ctx.e2b.cwd`.
- `environment.js`: an explicit `undefined` override is the seam's tombstone and removes the ambient entry.
- Known gaps (E2B limits): `e2b-replace-environment` (ambient env probe until a command can start with a replacement environment), `e2b-publication-cancel` (join cancellation to the termination transaction before aborting an in-flight SDK file read), `e2b-status-watch` (collect/inherit polling until direct-command exit is observable independently of descendant-held output), `e2b-pgid-identity` (numeric PGID reuse race in `signalRemoteGroups` and retained PTY/session ids until identity-bound operations exist), `e2b-terminal-setup-rollback` (retry state only if a real double failure must be recovered before disposal or timeout).
