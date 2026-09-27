# freddie-hooks-codex

Bridge for unmodified Codex command hooks: point it at a Codex `hooks.json` and those external shell hooks run on freddie's typed interception extension points — `SessionStart` (`agent/created`), `UserPromptSubmit` (`agent/pre-step`), `PreToolUse`/`PostToolUse` (`tools/pre-execute`/`tools/post-execute`), and `Stop` (`agent/turn-stopping`). Shared parsing, execution, matcher evaluation, and durable `hook/invoked`/`hook/result` logging live in `@freddie/freddie-hook-protocol` (the same library `@freddie/freddie-hooks-claude-code` builds on); this package owns only the Codex dialect.

Codex is a narrower dialect than Claude Code by design: five events (no `SubagentStart`/`SubagentStop`), matchers are always regexes (no literal-alternation fast path), payloads are snake_case with `model`/`permission_mode`/`turn_id` fields Claude Code's shape lacks, stdin carries no trailing newline, there is no `${VAR}` command substitution or custom hook environment, and `PreToolUse` honors only a block — no `allow`/`ask` decision exists in this dialect.

## Surface

```yaml
# cordis.yml
- package: '@freddie/freddie-hooks-codex'
  config:
    configPath: /home/user/.codex/hooks.json
    model: deepseek-chat   # optional; stamped on every payload
```

A `PreToolUse`/`PostToolUse` deny blocks the tool call with the hook's reason; a blocking `Stop` hook steers the agent to continue instead of ending the turn; clean plain-text stdout (not JSON, not already-structured context) becomes additional context on `SessionStart` and `UserPromptSubmit` — Codex's plain-stdout-as-context convention, which Claude Code's dialect does not have.

## Model Experience

Hook-injected context enters as an ordinary user message with `source: { kind: 'plugin', plugin: 'hooks-codex' }` — visible in the transcript like any other context injection.

#### KV Cache effect

A hook that emits additional context adds a message to the turn, which is ordinary turn content; nothing here varies a request header independently of turn content.

## Known Limitations and Deferred Work

- **`SessionStart`'s `source` field is always `'startup'`**, and it doubles as the matcher subject for that event. freddie's `agent/created` event carries only `{ agent }`, with no equivalent classification — see the same limitation in `@freddie/freddie-hooks-claude-code`.
- **Turn-open detection reads `session.events` directly** rather than a registered `sessionProjections` unit — freddie has no `turnBoundary` projection, matching the same adaptation in `@freddie/freddie-hooks-claude-code` and `@freddie/freddie-tool-present`.
- **`transcript_path` is always `null`** — freddie's persistence seam exposes no artifact path a hook could read the raw log from.
- **No consecutive-`Stop`-denial guard.** A hook that always denies `Stop` loops the agent indefinitely; `stop_hook_active` is always reported `false` (Codex's own loop-guard signal has no freddie-side tracking yet), matching the upstream project's own documented TODO.
- **No per-session hook-config discovery.** `configPath` is read once at process load and applies to the whole process.
