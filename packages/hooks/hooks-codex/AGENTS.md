# @freddie/freddie-hooks-codex

## Rationale

- `SessionStart` is the one emit-shaped (detached) point Codex has: its run chains are tracked so disposal aborts a running hook process and drains the continuation (`docs/defensive-patterns.md`: dispose must reach quiescence). Hooks run in the agent's session workspace so relative paths address the user's project, not the server launch directory.
- Codex always interprets matchers as regexes (no literal fast path), writes stdin without a trailing newline (`trailingNewline: false`), and uses snake_case payloads with `model` on every event and `turn_id` on turn-scoped events. It supports reject only for `UserPromptSubmit` and block only for `PreToolUse`.
- Clean plain stdout becomes context only when no structured context exists; nonzero output and raw JSON (`{` prefix) never leak as prose. `agent/created` carries no `source`, so `SessionStart` reports `'startup'` (README "Known Limitations"); `transcript_path` is null (persistence seam exposes no artifact path).
- Context alone is not a veto: decisions delegate to `next()` and then fold this bridge's context onto the downstream decision. A blocking `Stop` hook (including exit 2 with empty stderr, which falls back to a generic steering line) forces continuation.
- `tool_name` in the `PreToolUse` payload is the real tool name (the `exec.name` matcher subject); a constant would make a config's tool matcher never fire. `tool_input` keeps Codex's `{ command }` shell shape derived from the call's `command` argument.

## Bridge facts

- Five points only (SessionStart, prompt/tool pre/post, Stop); only synchronous command hooks run, other types and `async: true` are reported as skipped. No command substitution or hook environment, regex-only matchers, snake_case payloads without trailing newline, no pre-tool approval or rewrite: only blocking decisions are honored.
- Matchers on UserPromptSubmit and Stop are discarded; an invalid regex throws `SyntaxError` so the config is rejected before listener registration.
- `configPath` is process-level (read once, relative to launch cwd); `model` is stamped on every payload. The open turn number is read from `session.events`. The stderr summary cap must be a positive integer.
- Types are no longer carried in JSDoc.
