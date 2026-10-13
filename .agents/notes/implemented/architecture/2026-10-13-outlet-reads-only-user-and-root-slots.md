# Agent Note: outlets re-render only for tracked reads, and root slots bind no session hooks

Status: implemented

## Problem

Measured with per-slot render counters on the streaming bench (400 messages, 200 reasoning tokens at 16 ms). The counters wrap `FreddieSlotOutlet#renderContent` and are removed before commit.

- `conversation.chat.node` rendered about 54 times per token and `conversation.message.images` about 53 times, although only the streaming seat changed.
- Sidebar slots (`sidebar.brand.*`, `sidebar.workspaces*`, `sidebar.settings`, `shell.overlay`, `settings.trigger`) rendered about 20 times per token in total.

Two causes:

- `UserMessageNodeView` and `MessageImages` are plain functions, so their outlets used the default `'all'` subscription. That subscribes to every provided session hook, and every streamed token notifies one of them.
- `#bindHookSources` subscribed a root-scoped slot to the active session's hooks. A root slot never receives session props (`standardKit` root uses only `useSessions`, `useWorkspaces`, and root injection), so those subscriptions could never produce a read.

## Decision

- Mark the pure user and steering renderers `functionSlot(UserMessageNodeView, { subscriptions: 'reads' })`. They read no observable during render: props, the locale `t`, and the `renderMessageImages` callback only.
- Mark `MessageImages` in `ui-attachment` as `'reads'`. It is props-only, with no hooks.
- In `FreddieSlotOutlet#renderContent`, pass `host.specOf(slotKey)?.scope !== 'root'` into `#bindHookSources`. Session hooks are bound only for session-scoped and session-maybe slots. Tracked reads are bound as before.

## Verification

Streaming bench (headless Chrome, `?fixture`, 400 messages, 200 tokens at 16 ms):

| state | script ms/token | task ms/token | chat.node renders/token | images renders/token | sidebar renders/token |
|---|---|---|---|---|---|
| HEAD (e1304386) | 10.3 to 10.6 | 14.9 to 15.2 | 54 | 53 | about 20 |
| + user and images `'reads'` | 7.9 to 8.0 | 12.5 to 12.9 | 1.3 | 0.4 | about 20 |
| + root slots bind no session hooks | 6.2 | 10.9 | 1.3 | 0.4 | 0 in the top list |

Newest appended user message is visible in the DOM after the bulk append (`newestUserVisible: true`). The only console errors are the fixture's unavailable Cordis RPC endpoints, which predate this change.

Drag bench: store check passes (conversation changes after "New session"). Sidebar session-item count is 5 before and after in both the new and the control run, so that probe cannot show sidebar reactivity; the sidebar's list data is the root-level `useSessions` and `useWorkspaces` reads, which stay tracked.

## Open

- The `conversation.composer` subtree (composer, input.left/right/dock/attachments/model) still renders about 25 times per token. Its entry is not `'reads'`, and its zone owner carries the whole session snapshot, which changes per token. Narrowing that needs a zone contract decision (the slot catalog documents `session` and `input` as the InputZone share).
- `conversation.session.header.*` renders about 2 to 3 times per token although its entry is `'reads'`. Its whole-snapshot selectors (`useSession(s => s)`) change per token, so revision-based invalidation fires; selection-based equality would fix this for `'reads'` outlets.
