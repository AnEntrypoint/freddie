# @freddie/freddie-hooks-claude-code

## Rationale

- Emit-shaped points run detached, so their chains are tracked; disposal aborts active hooks and drains continuations before resolving. Only the start edge guarantees registry access, so each local child is retained through its paired end (stop hooks keep the session workspace after the handle unregisters the agent); a producer that can omit that end must provide another release edge.
- Hooks run in the agent's session workspace (`session/new` cwd on the session header), not the launch directory of the executor or entry process; `CLAUDE_PROJECT_DIR` defaults to that workspace unless config sets it.
- `agent/created` carries no `source`/`signal`, so `SessionStart` reports `'startup'` (see README "Known Limitations"); `transcript_path` stays empty because the persistence seam exposes no artifact path (durable consumer gap in the README).
- Pre/post decisions delegate to `next()` first so later listeners may still block/rewrite, then fold this bridge's context onto the downstream decision (a downstream block carries it too). A blocking `Stop` hook steers at the stopping boundary, so the machine sees pending input and runs another step.
