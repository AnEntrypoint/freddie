# Agent Note: chat seats keep owner props stable across streaming tokens

Status: implemented

## Problem

Every streamed token re-rendered the whole chat window (40 seats at the default window), and each seat's `conversation.chat.node` outlet re-rendered its content. The outlet skip added with the slot-outlet change only helps when owner props and opts keep their identity, and four things in the seat chain broke that:

- `ChatView` built a new `renderMessageImages` closure per render, passed into every seat's owner props.
- `ChatNodeSeat` built a new `opts` object per seat per render, including a lazy `fallback` getter.
- `AssistantMarkdown` built a new `images` array of `{ attachment }` objects per image group per render.
- `MessageItem`'s `contentParts` built a new `images` array per user bubble per render.

## Decision

- `ChatView` exposes one stable `#renderMessageImages` method that reads the latest props when called.
- `ChatNodeSeat` caches `opts` per node (keyed by node identity, `nodeKey` and translator), so unchanged nodes keep their options object.
- `AssistantMarkdown` caches each image group's `images` array keyed by the group's first block and its member blocks.
- `MessageItem` caches `contentParts` per content array (store identity).

## Verification

Live streaming benchmark (headless Chrome, `?fixture` profile, 400 messages, 200 reasoning-delta tokens at 16 ms):

- before: script 11.9 ms per token, task 16.1 ms per token, 108 outlet `setProps` per token
- after: script 10.6 ms per token, task 15.5 ms per token

A per-owner-key diagnostic showed the `renderMessageImages`, `images`, `selectedCallId`, `cwd`, `fileMentions`, `openFile` and `inspectCall` keys no longer change between seat renders. No console errors other than the fixture's unavailable Cordis RPC endpoints, which predate this change.

## Open

Most of the remaining per-token cost sits in the composer subtree: outlets for `onPicked`, `onCancel`, `onError`, `overlay`, `leftItems`, `rightItems`, `footer`, `attachments`, `onAddImages`, `onRemoveImage` and `dropLimits` receive fresh closures every token, so the composer re-renders on each token. The `renderOutletContent` path also still runs `specOf`, `entriesOf` and the locale and inject proxies (about 1 ms per token together, mostly through the cordis property proxy). Both are next.
