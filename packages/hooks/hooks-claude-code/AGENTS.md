# @freddie/freddie-hooks-claude-code

## Rationale

- Emit-shaped points run detached, so their chains are tracked; disposal aborts active hooks and drains continuations before resolving. Only the start edge guarantees registry access, so each local child is retained through its paired end (stop hooks keep the session workspace after the handle unregisters the agent); a producer that can omit that end must provide another release edge.
- Hooks run in the agent's session workspace (`session/new` cwd on the session header), not the launch directory of the executor or entry process; `CLAUDE_PROJECT_DIR` defaults to that workspace unless config sets it.
- `agent/created` carries no `source`/`signal`, so `SessionStart` reports `'startup'` (see README "Known Limitations"); `transcript_path` stays empty because the persistence seam exposes no artifact path (durable consumer gap in the README).
- Pre/post decisions delegate to `next()` first so later listeners may still block/rewrite, then fold this bridge's context onto the downstream decision (a downstream block carries it too). A blocking `Stop` hook steers at the stopping boundary, so the machine sees pending input and runs another step.

## Bridge facts

- Only command hooks run; other hook types are reported as skipped. `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PROJECT_DIR}` are substituted at parse time (an unset variable stays verbatim). Malformed entries and unsupported events are ignored; matchers on UserPromptSubmit and Stop are discarded; an invalid matcher regex throws `SyntaxError` so the whole config is rejected before listeners register.
- `configPath` is process-level: read once at load, relative paths resolve against the launch cwd. `projectDir` defaults per run to the session workspace and is exported as `CLAUDE_PROJECT_DIR`.
- `updatedInput` is logged and warned, never honored; bespoke behavior belongs in typed native plugins on the same extension points.
- Subagent hooks report Claude Code's Task-tool default `agent_type`, because the harness subagent seam has no per-kind label; matchers naming a specific kind do not fire. `stop_hook_active` is always false and present on SubagentStop only.
- The open turn number is read from `session.events`, not a `turnBoundary` projection freddie lacks. Detached lifecycle points omit the `hook/invoked`/`hook/result` pair. The stderr summary cap must be a positive integer.
- Injected contexts carry the `{kind:'plugin', plugin:'hooks-claude-code'}` source.
- Types are no longer carried in JSDoc.
