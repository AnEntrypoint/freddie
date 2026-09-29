# @freddie/freddie-repeat-tool-reminder

## Rationale

- Only agent-loop calls participate: a direct `ctx.tools.execute()` caller has no model to remind and no agent id to key on.
- `tools/post-execute` observes and enriches, never vetoes: the count advances regardless of the downstream outcome, `next()` is delegated so a later listener can still block or replace, then the reminder is folded onto the result. `additionalContexts` rides both decision variants, so a blocked call still gets the nudge. A user interjection resets the chain (a repeat across it is not a loop) through a hook that always delegates.
