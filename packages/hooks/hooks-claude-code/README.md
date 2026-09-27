# freddie-hooks-claude-code

Bridge for unmodified Claude Code command hooks: point it at an existing `hooks.json` (or a settings file whose `hooks` key holds the same shape) and those external shell hooks run on freddie's own typed interception extension points — `SessionStart` (`agent/created`), `UserPromptSubmit` (`agent/pre-step`), `PreToolUse`/`PostToolUse` (`tools/pre-execute`/`tools/post-execute`), `Stop` (`agent/turn-stopping`), and `SubagentStart`/`SubagentStop` (`subagent/start`/`subagent/end`). Shared parsing, execution, matcher evaluation, and durable `hook/invoked`/`hook/result` logging live in `@freddie/freddie-hook-protocol`; this package owns only the Claude Code dialect — payload shapes, config format, and the mapping from a hook's neutral decision onto each extension point's own decision type.

## Surface

```yaml
# cordis.yml
- package: '@freddie/freddie-hooks-claude-code'
  config:
    configPath: /home/user/.claude/hooks.json
    projectDir: /home/user/project   # optional; defaults per-run to the session workspace
```

Only `command`-type hooks run; any other type in the config is skipped with a warning. `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PROJECT_DIR}` substitution applies to every command string at load time. A `PreToolUse`/`PostToolUse` deny blocks the tool call with the hook's reason; a blocking `Stop` hook steers the agent to continue instead of ending the turn; additional context any hook emits is injected as a user message before the model's next read. `updatedInput` and `systemMessage` hook outputs are logged and warned but not yet honored.

## Model Experience

Hook-injected context enters as an ordinary user message with `source: { kind: 'plugin', plugin: 'hooks-claude-code' }` — visible in the transcript like any other context injection, not hidden or model-invisible.

#### KV Cache effect

A hook that emits `additionalContext` adds a message to the turn, which is ordinary turn content and participates in caching the same way any other user message does; nothing here varies a request header independently of turn content.

## Known Limitations and Deferred Work

- **`SessionStart`'s `source` field is always `'startup'`.** Claude Code distinguishes `startup`/`resume`/`clear`/`compact`; freddie's `agent/created` event carries only `{ agent }`, with no equivalent classification. Every session this bridge observes is reported as a fresh startup — a hook that branches on `source` will not see the other cases.
- **Turn-open detection reads `session.events` directly** (the last `turn/start`) rather than a registered `sessionProjections` unit — freddie has no `turnBoundary` projection the way the seam this was ported from does. Matches the same adaptation in `@freddie/freddie-tool-present`.
- **`transcript_path` is always empty.** freddie's persistence seam exposes no artifact path a hook could read the raw log from.
- **Per-session hook-config discovery is not implemented.** `configPath` is read once at process load and applies to the whole process; a project-local `hooks.json` discovered per session workspace is a documented upstream TODO, not something this port added.
- **A blocking `Stop` hook has no consecutive-continuation cap.** A hook that always denies `Stop` will loop the agent indefinitely; hooks must self-limit until a guard exists.
- **`@freddie/freddie-hooks-codex`, the sibling bridge this package's group README also documents, does not exist yet.** Only the Claude Code dialect is implemented in this change.
