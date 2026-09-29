# AGENTS.md — sandbox

## Rationale

- `src/escalation.js` (fail-closed): the tool schema advertises every target mode because the effective mode is per-call truth; a request that cannot widen this call needs no approval (the standing policy already grants at least that access). Widening with no approval service throws; `allowed-once` is the only outcome that returns the mode, and `rejected`, `cancelled` and `unavailable` all throw. The approval `reason` is self-contained (`escalate sandbox to <mode>: <justification>`) because `approval/asked` stores it and the target mode is part of the grant identity.
- `src/roots.js`: roots are canonicalized with `realpathSync.native`, not the JavaScript realpath, which lexically collapses `..` before resolving a preceding symlink on some platforms; the native call follows the filesystem's component-by-component lookup, matching chdir/spawn and the enforcement layers this identity feeds. A failure (missing/unreadable prefix) returns the path unchanged.
