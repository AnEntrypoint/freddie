# Composer subscription paths and chat seat render budget: live witnesses

Date: 2026-10-13

## Composer chain (commit 4efb09e5 `reads` conversions)

The `conversation.composer` chain runs entries in ascending priority: subagent (-10),
question (0), approval (1). The first non-null `select` wins. The chain outlet is `reads`
only when every examined entry is `reads`, so it tracks only the guarded session reads.

Live, `?fixture`, session `fx-alpha`:

- Question composer mounted with 3 questions (`1 / 3`). Choosing a single-select option
  auto-advanced the progress (`2 / 3`, `3 / 3`). Submitting resolved the question and the
  approval panel mounted (headline `fixture persistent approval ...`, buttons Reject and Allow once).
- Allow once removed the approval panel and the input bar stayed mounted.

Not reachable from the fixture:

- Subagent read-only composer. `selectReadOnlySubagent` returns non-null only when the
  composer input carries `subagent` non-null and either `subagent.address.mode === 'one-shot'`
  (reason `one-shot`) or `subagent.parentAvailable === false` with `running !== true`
  (reason `parent-unavailable`). The fixture's `subagents.list` returns `entries: []` with
  `parentAvailable: true`, and it has no child session. The inputs `subagent`, `running`
  and `pending` all come from the single unguarded `useComposer(s => ({...}))` read in
  `FreddieConversationComposer`, so every change to them re-runs the chain.
- Approval command text. The fixture approval carries no `callId`, so the guarded
  `rootToolCall` read never resolves a command.

## Overview dock (Task 2)

The dock reads `connection.state` and `sessions.terminalActivity`, plus the host projections
`gmProgress`, `workflow` and `goal`. Drivers used live (see the fixture driver note):

- connection: `breakStreams()` (existing) gave `Reconnecting live updates`, then `Realtime connected`.
- gmProgress, terminal output: added `gmProgress(id, data)` and `terminalOutput(id, name, text)`.

## Chat seat render budget (Task 3)

Measured with a temporary `__renderCount` in `FreddieSlotOutlet#renderContent`, keyed by slot
and `hookContext` (the seat's node key). The counter was removed before this commit.

| Seat | 200 tokens, renders per token | 100 tokens, renders per token |
| --- | --- | --- |
| streaming `assistant-step` seat | 0.95 | 0.95 |
| 40 mounted user-message seats, total | about 80 renders (0.40 per token) | about 80 renders (0.82 per token) |
| turn-tail seat | 0 | not measured separately; not listed |

The user-seat total is the same at 100 and 200 tokens, so it is a fixed cost, not a per-token
cost. It is consistent with two or three ChatView renders per storm (`chatView setProps` 0.01 per
token at 200 tokens, 0.03 at 100 tokens). The likely trigger is the running-state transitions at the
start and end of the storm; that trigger was inferred, not instrumented.

Owner of the fixed burst: `standardKit` (`ui-renderer/src/client/scoped-slots.js`) builds a
new `renderSlot` (`boundRenderSlot`) on every outlet render. ChatView passes it to every seat
in `ChatNodeSeat` props, and `sameSeatProps` compares by identity, so each ChatView render
re-renders every mounted seat. Node identity does not change for these seats.

Decision: not changed. The per-token cost beyond the streaming seat is zero, so caching
`boundRenderSlot` in the shared kit would change every outlet for a burst that happens only at
turn transitions and is capped by the mounted row window (40 here).

Streaming text, pinned scroll and `newestUserVisible` were unchanged in the bench (`newestUserVisible: true`,
distance from bottom 0).
