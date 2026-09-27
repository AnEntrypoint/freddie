# Agent Note: `present` tool for explicit file deliveries

Status: implemented

## Problem

`@freddie/freddie-client-ui-deliverables` already surfaces "produced files" for a turn, but strictly by inference: it reads the `locations` a mutation tool's render intent reports (a diff card, or a generic card with `kind: 'edit'`), documented as deliberate ("a produced file must be listed whether or not the model remembered to name it"). That inference has a real blind spot: a file a `bash` command produced (a script-generated PDF, spreadsheet, or slide deck) or an already-existing file the model wants to hand off has no `locations` for the inference to read at all. `deepseek-ai/deepseek-harness`'s `deliverables/tool-present` solves exactly this complementary case with an explicit `present` tool.

## Decision

New package `packages/deliverables/tool-present` (`@freddie/freddie-tool-present`), ported close to verbatim: validates an open turn and the session workspace, confirms each path is an existing regular file (`lstat` on the request path, then `resolve`/`stat` on the target — catching a symlink-to-directory at the request path itself before ever reaching the resolved target), and appends `deliverables/presented: { turn, callId, files }` to the session, marked `{ ignorable: true }`, only after the tool call itself settles without error.

Two adaptations. First: freddie has no `sessionProjections` `turnBoundary` unit (the seam dsh's version reads via `ctx.sessionProjections.stateOf(session, 'turnBoundary')`), so this reads `session.events` directly for the last `turn/start`/`turn/end` pair — the identical technique `@freddie/freddie-agent-loop` itself already uses internally to derive `lastTurn` (`packages/core/agent-loop/src/agent.js`). This needed no new core-loop instrumentation and no new registered projection unit; it reads the same event log the loop already appends to. Second: `deliverables/presented` is a session event type outside freddie's generated `KNOWN_SESSION_EVENT_TYPES` set (`packages/core/session/src/known-event-types.js`), whose own generator (`scripts/gen-persistence-catalog.ts`) does not exist in this buildless-JS tree; without `ignorable: true`, `packages/session/session-persistence/src/coordinator.js`'s `assertEventsSupported` would refuse to reload any session that used this tool once persisted. `ignorable: true` is correct here since the event carries no content required to reconstruct the model-visible conversation — discovered and fixed during the later `workspace-changes` port (see [its Agent Note](2026-09-27-workspace-changes-per-turn-file-summary.md)), which hits the identical gate.

## Alternatives considered

**Skip this because `ui-deliverables`'s inference already covers "produced files."** Rejected: inference is turn-scoped to tracked mutation-tool `locations` and cannot see a `bash`-produced or pre-existing file — a different, narrower guarantee than upstream's `present` tool provides. The two are complementary, not competing.

**Port `sessionProjections`'s `turnBoundary` unit to match upstream exactly, rather than reading `session.events` directly.** Rejected for this change: building a new registered projection unit is a larger, separate architectural addition (a new reusable `ctx.sessionProjections` state key other consumers could also read) than this one tool needs. Reading the event log directly, the same way `agent-loop` itself already does, is the minimal correct implementation; factoring it into a shared projection unit is a legitimate future refactor if a second consumer needs the same state, not a requirement for this tool to work correctly today.

## Consequences

Verified live against a real `defineTool` registration and a stubbed session/fs: a full success path (turn number and files returned, `deliverables/presented` appended only after `tools/result` reports success), a missing-file rejection (no event appended), a closed-turn rejection, and an error-result path (never appends). `pnpm run publint` passes (229/229). A CLI headless boot regression-checked cleanly (this tool is not wired into any shipped profile, so this only confirms no collateral damage).

**Ships without the produced-files chip.** `@freddie/freddie-client-ui-deliverables`'s turn-tail row does not read `deliverables/presented` events today — a `present` call renders as an ordinary tool-call row in the transcript, not as a special produced-file chip. Wiring the two together is additive client-side work (reading one more event type alongside the existing `locations` inference), left as a follow-up rather than bundled into this change.

`deliverables/workspace-changes` (per-turn git working-tree snapshot diffing) is a separate package of the same upstream group, implemented in [its own Agent Note](2026-09-27-workspace-changes-per-turn-file-summary.md).
