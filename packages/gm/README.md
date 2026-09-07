# gm/ — first-class gm spool access

Cordis-native gm access and the model-facing tools over it. Group READMEs own package/ctx-key maps.

| Package | Purpose |
|---|---|
| [`gm-client/`](gm-client/README.md) | `ctx.gm`: in-process spool dispatch against `.gm/exec-spool/`, boot-if-needed against the shared daemon |
| [`tool-gm/`](tool-gm/README.md) | Model-facing `gm_*` tools over `ctx.gm` (instruction, phase-status, codesearch, recall, prd-add/resolve, mutable-add/resolve, transition, exec_js, git_finalize) |

The [capability-seam glossary](../../docs/glossary.md#capability-seam) owns the Service Definition / Provider / Consumer split; this group is a Consumer of gm's on-disk spool, not a second daemon.
