# Agent Note: Value-guarded observable reads

Status: implemented

## Problem

While a response streams, every token notifies the session source. Outlets that subscribe to all provided hooks (or read unguarded) re-render on each notification even when what they draw is unchanged. Measured per token before this change: `conversation.view` 0.96 renders, `conversation.composer` 0.94, `conversation.input.overlay` 0.94, and `composer.bar`/`input.dock` cascaded at 0.94. The chat view also re-rendered every chat node on each token, pushing outer-view work into every seat.

## Decision

`observableHook(source)` takes an optional equality argument. A read without `equal` stays unguarded (re-renders on every notification of its source). A read with `equal` is guarded: `trackReads` records `{ selector, equal, value }` per source, where `value` is the value the last render drew. On notify, `guardChanged` re-runs each guard against the new snapshot and re-renders only when some `equal(next, drawn)` is false. A throwing selector counts as changed so the render surfaces the error. Guards are only valid on immutable selected values; mutable handles stay unguarded so in-place changes are not lost.

`ChatView` reads only the values it draws through guarded reads: chat order (`sameItems`), running/open state, steering items, first and last anchors, selection call id and cwd. Chat node handles are replaced on every upsert (`MutableChatNodeStore.upsert`), so identity guards on nodes cannot skip the outer render; that is why per-token content does not go through the outer view. `ChatNodeSeat` instead reads its node untracked with `hook.peek` and subscribes itself with `hook.subscribe`, ordered by DOM depth. The seat re-renders only when its peeked node identity changes, so streamed content moves from the outer view to the seat.

Composer chain and overlay: `ApprovalPanel`, `ConversationComposer` and the input-trigger, command-popup, question-composer and subagent composers opt into `subscriptions: 'reads'`. `renderSlotChain` owners that build their raw fallback from tracked renders pass `fallbackSubscriptions: 'reads'`, which drops the default raw-overlay participant that otherwise forced provided-hook delivery for the whole chain.

`FreddieRootOutlet` keeps unguarded revision semantics by design. Registry, locale, provider, fan-out order, consumed-revision delivery and teardown are unchanged.

## Alternatives considered

**Identity guards on chat node handles.** Rejected: handles are replaced per upsert, so identity never holds for a streaming node and the guard never skips.

**Narrow the outer chat view's props per node.** Rejected: pushes node-identity semantics into every consumer of `chat.nodes` and still re-renders the view per token.

**Global equality on every provided hook.** Rejected: provided hooks feed mutable projection handles and legacy entries that rely on the all-provided notification contract.

## Consequences

Measured live in the fixture (400 messages, 200 streamed tokens, 16 ms interval), before to after:

| metric | before | after |
|---|---|---|
| `conversation.view` renders/token | 0.96 | 0.01 |
| `conversation.composer` renders/token | 0.94 | 0 |
| `conversation.input.overlay` renders/token | 0.94 | 0 |
| `composer.bar` and `input.dock` renders/token | 0.94 | 0.01 |
| `conversation.chat.node` renders/token | 1.35 | 1.33 (seat renders, unchanged) |
| ChatView setProps/token | 0.96 | 0.01 |
| per-token task ms | 5.617 | 3.13 |
| inclusive chat ms/token | 0.475 | 0.276 |

Post-storm scroll stays at the bottom (distanceFromBottom 0), the streamed final text is in the DOM, the newest user message is visible, and the slash menu opens and closes. The only console errors are the three known fixture RPC failures (`syncInspectManifest`, `inventory`). A sidebar drag from 280 to 420 px completes with no errors.

Not exercised live: approval panel, subagent read-only composer and question composer paths, which the fixture does not reach. Their opt-in is static and follows the same guard contract.

## Obligations

Any new `useSession`/`useStore` read whose selected value is a mutable handle must omit `equal`. A new second argument to a hook must be a function. Guarded reads over immutable values belong in the owning README's observable delivery section, as in `ui-renderer` and `ui-slots`.
