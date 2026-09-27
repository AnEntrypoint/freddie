# Agent Note: Claude Code hook bridge

Status: implemented

## Problem

`packages/hooks/README.md` already documented `hooks-claude-code/` and `hooks-codex/` as this subsystem's two bridge plugins, linking to READMEs that didn't exist — the shared `@freddie/freddie-hook-protocol` library was fully built (matching `deepseek-ai/deepseek-harness`'s exports exactly: `matcherDiagnostic`/`matchesMatcher`, `parseHookOutput`, `runHook`/`DEFAULT_HOOK_TIMEOUT_MS`, `mergeHookOutputs`, `appendHookInvoked`/`appendHookResult`, `createDetachedRuns`), but neither consumer existed. The same documented-but-unbuilt pattern as `tool-lsp`.

## Decision

New package `packages/hooks/hooks-claude-code` (`@freddie/freddie-hooks-claude-code`), ported closely: `config.js` parses a `hooks.json` (or a settings file's `hooks` key) into matcher groups, command-only, with `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PROJECT_DIR}` substitution; `index.js` maps six freddie extension points onto Claude Code's hook events — `agent/created` → `SessionStart`, `agent/pre-step` → `UserPromptSubmit`, `tools/pre-execute`/`tools/post-execute` → `PreToolUse`/`PostToolUse`, `agent/turn-stopping` → `Stop`, `subagent/start`/`subagent/end` → `SubagentStart`/`SubagentStop` — running matched command hooks through the shared library's `runHook` and folding their outputs through `mergeHookOutputs` onto each extension point's own decision shape (`{kind:'reject'}`/`{kind:'enter', messages}`, `{kind:'deny'|'ask', reason?}`, `{kind:'block', feedback, additionalContexts?}`).

Every extension point's exact contract was independently verified against freddie's real source before porting (not assumed from the upstream port): `tools/pre-execute`/`tools/post-execute`'s decision shapes and `ctx.waterfall` dispatch (`packages/core/tools/src/index.js`), `agent/pre-step`'s `{kind:'enter'|'reject'}` (`packages/core/agent-loop/src/agent.js`), `agent/created`'s payload shape (`packages/core/agent/src/index.js`), `subagent/start`/`subagent/end` (`packages/subagent/subagent/src/lifecycle.js`), and `ShellExecutor.resolve`/`.run` (`packages/shell/shell/src/index.js`).

Two adaptations, both because freddie's real shape differs from what the upstream bridge assumed:

- **`agent/created` carries only `{ agent }`** — no `source`/`signal` the way the seam this bridges from provides. `signal` was already defensively handled by the upstream code's own fallback (`signal === undefined ? detached.signal : ...`); `source` has no freddie equivalent, so `'startup'` is used unconditionally (documented as a limitation — every session reports as a fresh startup, never `resume`/`clear`/`compact`).
- **No `sessionProjections` `turnBoundary` unit** — same gap as `@freddie/freddie-tool-present` and `@freddie/freddie-hooks-claude-code`'s `agent/pre-step`/`tools/*` turn lookups now read `session.events` directly for the last `turn/start`, matching `@freddie/freddie-agent-loop`'s own internal technique.

**Correctness check applied, not needed:** `hook/invoked`/`hook/result` (appended by the shared, already-shipped `@freddie/freddie-hook-protocol`) are already present in `packages/core/session/src/known-event-types.js`'s `KNOWN_SESSION_EVENT_TYPES` — unlike `deliverables/presented` and `workspace/changes` from the two prior changes, no `ignorable: true` marker is needed or added here, since the persistence-catalog generator (missing in this tree, per those two notes) evidently did register these two event types when they were added to the hook-protocol library.

## Alternatives considered

**Port `hooks-codex` in the same change.** Rejected for this change: the codex dialect is a real, independent surface (its own config shape, its own always-regex matcher mode) deserving its own verification pass against freddie's actual extension points, not a shared review with this one. `packages/hooks/README.md` still links to a not-yet-created `hooks-codex/README.md`; a future change closes that specific gap.

**Leave `agent/created`'s `source` unset (`undefined`) rather than defaulting to `'startup'`.** Rejected: a `SessionStart` hook payload with `source` genuinely absent looks more broken to a hook script written against Claude Code's real contract (which always supplies it) than a payload that is simply always `'startup'` — the common case this bridge exists for. Documented as a known limitation either way.

## Consequences

Verified live against a real `@freddie/cordis` `Context` (not a stub) with a fake `ctx.shell` returning the real `{ exitCode, stdout: { text }, stderr: { text } }` shape `@freddie/freddie-subprocess`'s collected-output contract requires: config parsing (matcher preservation, matcher discarding for `UserPromptSubmit`, non-command-hook skipping, invalid-regex `SyntaxError`, substitution); the full `apply()` wiring end to end — `SessionStart` injecting context via the real `hookSpecificOutput.hookEventName`-gated codec, `PreToolUse` denying a matched tool while allowing an unmatched one through `ctx.waterfall`'s real default, `PostToolUse` folding context onto a real `{kind:'accept'}` decision, and a `Stop` hook forcing continuation via `agent.steer()` with its actual stderr-derived reason. `pnpm run publint` passes (231/231). A CLI headless boot regression-checked cleanly (this plugin is not wired into any shipped profile).

Ships without `hooks-codex`, and without per-session hook-config discovery (a documented upstream TODO the port did not add) or a consecutive-`Stop`-denial guard (also upstream-documented as pending).
