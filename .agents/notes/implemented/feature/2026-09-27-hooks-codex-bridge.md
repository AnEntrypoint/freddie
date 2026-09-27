# Agent Note: Codex hook bridge

Status: implemented

## Problem

`packages/hooks/README.md` links to `hooks-codex/README.md` alongside `hooks-claude-code/README.md` — both bridges were documented as this subsystem's two consumers of the shared `@freddie/freddie-hook-protocol` library, but only `hooks-claude-code` existed after [its Agent Note](2026-09-27-hooks-claude-code-bridge.md). This closes the remaining half of that documented gap.

## Decision

New package `packages/hooks/hooks-codex` (`@freddie/freddie-hooks-codex`), ported closely, mirroring `hooks-claude-code`'s extension-point mapping minus `SubagentStart`/`SubagentStop` (Codex's dialect has no subagent hook events). The two dialects diverge in ways this port preserves exactly: Codex matchers are always regexes (no Claude-style literal-alternation fast path via `matchesMatcher(..., 'codex')`), payloads are snake_case with `model`/`permission_mode`/`turn_id` fields Claude Code's shape lacks, `runHook` is called with `trailingNewline: false` (Codex writes stdin without a trailing newline, unlike Claude Code), there is no `${VAR}` command substitution or custom hook environment, and `PreToolUse` honors only a block decision (no `allow`/`ask`). Codex additionally treats clean plain-text stdout (exit 0, no structured JSON, no existing `additionalContext`) as context on `SessionStart`/`UserPromptSubmit` — a convention Claude Code's dialect does not have, preserved via the same `plainStdoutAsContext` gate upstream uses.

Same two adaptations as `hooks-claude-code`, for the identical reasons documented there: `agent/created`'s missing `source` defaults to `'startup'` (here it also doubles as the `SessionStart` matcher subject, unchanged from upstream), and turn-open lookups read `session.events` directly instead of a nonexistent `sessionProjections` `turnBoundary` unit.

## Alternatives considered

**Share the payload-building helpers (`base`, `turnBase`, `blocksToText`) with `hooks-claude-code` instead of duplicating small variants.** Rejected, matching the upstream project's own explicit choice (its `index.ts` comments: "These small payload helpers intentionally remain next to the dialect shape; sharing them would pull bridge-only agent/LLM dependencies into hook-protocol" and "Execution and decision mapping remain in each bridge so dialect differences stay explicit at their owning extension point"). The two dialects' payload shapes are similar but not identical (snake_case field sets differ, Codex adds `model`/`turn_id`/`permission_mode`), and forcing a shared helper would either leak one dialect's fields into the other or need per-dialect branches inside a "shared" function — worse than two small, independently-readable dialect modules.

## Consequences

Verified live against a real `@freddie/cordis` `Context` with a fake `ctx.shell` returning the real subprocess collected-output shape: config parsing (regex matcher preservation, `timeoutSec`/`timeout` alias acceptance, async-hook and unsupported-type skipping with reasons, invalid-regex `SyntaxError`, bare-word patterns treated as regex source rather than Claude's literal form); the full `apply()` wiring — `SessionStart` converting clean plain-text stdout to context (the Codex-specific convention), a regex-anchored `PreToolUse` matcher denying an exact tool-name match while allowing a near-miss through, a `Stop` hook forcing continuation via `agent.steer()`, and — specifically — confirming the fake shell observed stdin with **no** trailing newline (the one contract most likely to regress silently if copied from the Claude Code bridge without care). `pnpm run publint` passes (232/232). A CLI headless boot regression-checked cleanly (this plugin is not wired into any shipped profile).

`packages/hooks/README.md` now links to two READMEs that both exist; the subsystem's documented shape and its shipped code agree.
