# Agent Note: chat row seats own their node read

Status: implemented

## Problem

ChatView's render called every mounted `ChatNodeSeat` function, and `ChatNodeSeat` read `chat.nodes.get(nodeKey)` inside that parent render. Each seat then created a `conversation.chat.node` outlet vnode whose `ref` called `setProps` on every ChatView render, so one streamed token produced about 39 outlet `setProps` calls. Only the streaming assistant-step node changes identity per token; the bulk user rows do not.

## Decision

- `ChatNodeSeat.js` defines `freddie-chat-node-seat` (`FreddieChatNodeSeat`), a custom element that is the flow item itself: the class and the `chatAnchorKey`, `chatFlowKey` and `chatFlowKind` data attributes sit on the host, so the column's child and sibling selectors in `ChatView.css.js` still match.
- ChatView renders keyed seat hosts whose `ref` calls `setProps` with the same owner props as before. ChatView's own render no longer creates per-node outlet vnodes.
- A seat reads its own node in `setProps` and skips rendering when the node identity and every prop in `SEAT_PROPS` are unchanged under `Object.is`. Only the seat whose node changed calls its outlet.
- Node identity is a valid change signal here because `MutableChatNodeStore.upsert` replaces a node object whenever its content changes. The store itself is never compared by identity, and generic selector equality is unchanged.

## Verification

Live DIAG stream bench (400 messages, 200 tokens, 16 ms interval, fixture profile):

- `conversation.chat.node` outlet `setProps` per token: 39.2 before, 0.95 after
- `freddie-chat-view` `setProps` per token: 0.96 before, 0.98 after
- inclusive chat cost: 0.74 ms before, 0.59 ms after; outlets: 1.25 ms before, 1.11 ms after
- `newestUserVisible` true; console errors limited to the three known fixture RPC errors

Drag bench: sidebar drag resizes 280 px to 420 px with no console errors.

## Open

- `ObservabilityDock` selects `chat.nodes` on its own path and is unchanged by this note, but it was not separately witnessed live.
- ChatView's `#afterRender` still reads the store for anchor and last-node bookkeeping on each render; this is cheap and was left alone.
- Composer outlets still receive fresh closures per token, as recorded in [2026-10-13-chat-seat-owner-props-stable.md](2026-10-13-chat-seat-owner-props-stable.md).
