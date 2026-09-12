# gm/ — first-class gm spool access

Cordis-native gm access and the model-facing tools over it. Group READMEs own package/ctx-key maps.

| Package | Purpose |
|---|---|
| [`gm-client/`](gm-client/README.md) | `ctx.gm`: in-process spool dispatch against `.gm/exec-spool/`, boot-if-needed against the shared daemon |
| [`gm-config/`](gm-config/README.md) | Read-only `gm.config.json` / prose / FSM graph resolver over already-materialized caches ([SSOT tradeoff](../../.agents/notes/implemented/architecture/2026-09-07-gm-config-readonly-resolver.md)) |
| [`gm-progress/`](gm-progress/README.md) | Host session projection for committed GM progress snapshots |
| [`tool-gm/`](tool-gm/README.md) | Model-facing `gm_*` tools over `ctx.gm` (instruction, phase-status, codesearch, recall, prd-add/resolve, mutable-add/resolve, transition, exec_js, git_finalize, scan_deps, residual-scan) |

The [capability-seam glossary](../../docs/glossary.md#capability-seam) owns the Service Definition / Provider / Consumer split; this group is a Consumer of gm's on-disk spool, not a second daemon.

Local commits in `C:\dev\gm` (parent plus `agentplug` / `gm-config` / `rs-plugkit` submodules) are allowed; push/PR to AnEntrypoint requires explicit user go-ahead. `AGENTPLUG_HOME` isolates a local runner from the machine-wide daemon ([contribution path](../../.agents/notes/implemented/process/2026-09-07-gm-upstream-contribution-path.md)).
