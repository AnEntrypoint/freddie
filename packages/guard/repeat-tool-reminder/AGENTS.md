# @freddie/freddie-repeat-tool-reminder

## Rationale

- Only agent-loop calls participate: a direct `ctx.tools.execute()` caller has no model to remind and no agent id to key on.
- `tools/post-execute` observes and enriches, never vetoes: the count advances regardless of the downstream outcome, `next()` is delegated so a later listener can still block or replace, then the reminder is folded onto the result. `additionalContexts` rides both decision variants, so a blocked call still gets the nudge. A user interjection resets the chain (a repeat across it is not a loop) through a hook that always delegates.
- Misconfiguration fails loud at plugin load (empty `thresholds`, non-integer, value below 2, duplicate); thresholds are sorted ascending once because `thresholds[0]` is the gentle tier. `include`/`exclude` are `*`-wildcard predicates over tool names at call time, so a pattern matching no registered tool stays valid (`exclude: [mcp_*]` with no MCP tools loaded).
- Reminders carry a `{kind:'plugin'}` source; an unlabeled context would render as a user prompt in derived history.
- Counting happens in post-execute because denied calls flow through the same waterfall, and a model hammering a denied call is the loop worth breaking.
- Arguments are canonicalized by deep key-sort of the loop's `JSON.parse` output (or its raw-string fallback), so no bigint/cycle/`undefined` handling exists. Truncation bounds only the model-visible text; the chain key uses the full canonical string.
- Untracked tools are transparent: they neither count nor reset the chain.
