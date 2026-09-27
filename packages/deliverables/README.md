# deliverables/ — what a turn changed or delivered

Two independent lenses on turn output, neither depending on the other: an explicit model-declared delivery, and an automatic per-turn file-change summary.

| Package | Role |
|---|---|
| [`tool-present/`](tool-present/README.md) | Model-facing `present` tool; appends a `deliverables/presented` session event for a file the model declares as a deliverable |
| [`workspace-changes/`](workspace-changes/README.md) | Automatic per-turn changed-file summary from git snapshots and file-tool captures, served with per-file diffs |

`tool-present` complements `@freddie/freddie-client-ui-deliverables`'s automatic inference (produced files derived from a turn's own write/edit tool calls) with an explicit declaration path for files that inference cannot see: a `bash`-produced artifact, or an already-existing file the model wants to hand off on purpose. `workspace-changes` is a broader, non-model-facing lens: every file a turn touched, inferred or not, with line counts and diffs — a superset a future UI surface could read instead of (or alongside) the narrower `locations`-based inference.
