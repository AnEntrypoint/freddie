## Rationale

- `src/index.js` no own `Config`: the sandbox default (mode + workspaceRoot) is owned by `ctx.sandboxPolicy`, so this executor inherits `PwshLocalExecutor`'s `Config` verbatim (the config catalog walks the inherited static). `this.mode` is the default mode used only for schema advertisement; tool executions carry their resolved per-call policy.
- `src/index.js` run/start failure ordering: an upstream abort stays cancellation even when it prevents spawn. A runner failure outranks a denial because the command did not run and its diagnostics may contain denial terms; the matched fatal line is carried, not an informational line that preceded it. A rejected spawn never started the confined launch.
- `src/index.js` `start`: after `startArgv` returns, process facts are installed synchronously because promise settlement cannot run before `start()` returns.
- `src/helpers.js` `classifyRunnerFailure` rules: an empty or whitespace-only fatal signature is not meaningful runner evidence and is ignored while valid signatures beside it stay active.
