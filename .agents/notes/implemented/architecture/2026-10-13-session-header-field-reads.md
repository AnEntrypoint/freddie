# Agent Note: session header children re-render only for the fields they display

Status: implemented

## Problem

Measured with per-slot render counters on the streaming bench (400 messages, 200 tokens at 16 ms, private worktree server). The counters wrap `FreddieSlotOutlet#renderContent` and the revision-notify callback, and are removed before commit.

Renders per streamed token before the change (HEAD 119e5cf6):

- `conversation.session.header.lineage` 2.4
- `conversation.session.header.utilities` 1.6
- `conversation.session.header.actions` 1.6
- `conversation.session.header` 0.82

Each child notified about 1.58 times per token from the session source (`<- src`), and the header root about 0.8 times. The list source (`<- list`) notified about 0.03 times per token.

Two causes:

- Header children were registered with the default `'all'` subscription. That subscribes to every provided session hook, including `session`, which notifies per token.
- The header root read `useSession(s => s.composerPhase)` and `useSession(s => s.blank)`. Those reads are tracked against the session source, which notifies per token. The `'reads'` contract compares no selected values, so each notification re-renders the root even when both values are unchanged.

## Decision

- `sessions/header.js` adds `createSessionHeaderSource(session)`. It is a derived source over the session that exposes `{ composerPhase, blank }` as a frozen object. Its subscription forwards to the session only when those two fields change, so a per-token session notification that leaves them unchanged produces no revision bump.
- `SessionRuntime.resolve` adds `header` to each session binding. `SessionProvideChannel`'s base descriptor declares `sessionHeader` next to `session`, so standard props expose `useSessionHeader` through the usual `use<Name>` mapping.
- The header root reads `const { composerPhase, blank } = useSessionHeader(s => s)`.
- The header children switch to `'reads'`: lineage (`ui-subagent`), job list (`ui-jobs`), open-in-app (`ui-open-in-app`), agent-preset label (`ui-agent-preset`, `functionSlot`), and session-log download (`session-log-export`, `functionSlot`). They read only the list, the job and preset stores, and their own stores, so they no longer subscribe to the session source.
- The outlet, the `ui-slots` contract, and the ui-renderer README are unchanged. The README already states that a slot opts into `'reads'` through `webjsxSlot` or `functionSlot`.

## Verification

Streaming bench (headless Chrome, `?fixture`, 400 messages, 200 tokens at 16 ms, worktree build):

| state | header renders/token | lineage | utilities | actions | `inclusiveMsPerToken.header` |
|---|---|---|---|---|---|
| HEAD (119e5cf6) | 0.82 | 2.4 | 1.6 | 1.6 | 0 |
| header projection and `'reads'` children | 0.02 | 0.02 | 0.02 | 0.02 | 0 |

`shape.newestUserVisible` is true. The only console errors are the three fixture RPC errors that predate this change (`syncInspectManifest`, `inventory` twice).

Drag bench (`drag-bench.mjs`, worktree build): the sidebar resizes from 280px to 420px and the store check passes. `errors` is empty.

## Open

- `conversation.composer` and its input zones still render about 5 times per token (`conversation.composer <- src`). They read the whole session snapshot through the zone owner, which needs its own projection, and the zone contract decides that.
- `conversation.session` (body) reads `composerPhase` and `blank` through `useSession`. It re-renders about 0.9 times per token. A projection like the header's would fix it.
