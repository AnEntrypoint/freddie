# AGENTS.md — tool-jobs

## Rationale

- `src/index.js` wake budget: `spentWakes` is keyed by the exact Agent (a same-session replacement starts full). `maxConsecutiveWakes` must be a safe integer: `Infinity` would leave the runaway chain unbounded and a fraction names no turn. Only a `user` inbox claim refills the budget, never a notice this plugin queued; under quiet delivery nothing spends it.
- `src/index.js` `onJobDone`: delivery targets the exact lifecycle owner (reusable ids could resolve to a replacement). A busy owner gets the notice injected into its next-step inbox (jobs settling together cost one step); an idle owner is woken, because an unclaimed notice is a completion the model never learns about. Disposal before the claim discards it with the owner; teardown settlements arrive `reported`. The registry already scopes listeners to the owner's scope chain, so this listener never picks whom to deliver to.
- `src/index.js` `job_output`: a timed-out wait returns job state (`[status: running]`), not a `TOOL_TIMEOUT` error, so the tool owns its deadline instead of `ToolDefinition.timeoutMs`. The output/status rendering is preserved only while policy left the default rendering intact. `attachController('tool-jobs')` must run first: producers may start work only while a controller is attached. The `tool:jobs` prompt section sits at `order: 106`, after the bash section and before product sections.
- `src/index.js` `job_kill` returns a snapshot of current state without consuming pending output.
- Job-control outputs strip ownership and notification bookkeeping from registry snapshots.
