# Agent Note: Mount gm residual-scan as a model-facing tool

Status: implemented

## Problem

gm's DECIDE→COMPLETE stop gate requires a `residual-scan` dispatch in the current stop window. Native gm already implements that verb (`rs-plugkit` residual.rs writes `.gm/residual-check-fired` as `<session_id>:<fired_at_ms>`). `@freddie/freddie-tool-gm` never registered it, so a strapped Freddie session could only call `gm_scan_deps` and then loop on the same COMPLETE residual.

## Decision

`tool-gm` now registers `gm_residual_scan` over spool verb `residual-scan` with an empty body, matching `gm_phase_status`. The tool writes nothing itself; the daemon's residual-scan handler still owns the marker and the four checks (worktree-clean, remote-pushed, prd-empty, mutables-witnessed).

## Alternatives considered

- **Treat `gm_scan_deps` as residual-scan.** Lost because the gate names a specific verb and a session-bound marker, not a dependency walk.
- **Write `.gm/residual-check-fired` from the agent.** Lost because the reader checks session id and time; a fabricated marker is a false witness.
- **Keep looping COMPLETE.** Lost: three identical denials are the BBCR stop, not a recovery path.

## Consequences

A new model-facing schema appears whenever `tool-gm` is mounted, so KV-cache prefixes that previously saw twelve gm tools invalidate on first schema token. Sessions started before this package reload still cannot fire residual-scan until the host fiber reloads `tool-gm`.
