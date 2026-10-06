# Agent Note: Composer read-tracked subscriptions

Status: implemented

## Problem

A draft notification redraws the conversation layout, session body and transcript although those components do not consume draft state. Moving the composer into its own element does not isolate delivery: every slot outlet subscribes to every provided hook by default. Dynamic entries can rely on that delivery even without calling a hook during rendering, so globally removing it changes their contract.

## Decision

The resident ConversationRoot owns the scrollport, direct composer seat and resize observer. Its session-maybe `conversation.composer.body` child receives `{ hero }` and owns the composer and hero declarations, workspace picker and complete current session/InputState currency. The body and entry hosts use `display: contents`; the composer chain retains its resident fallback. InputZone still receives all six InputState fields, not a draft-only projection.

`webjsxSlot(tag, { subscriptions: 'reads' })` explicitly asserts complete tracked render dependencies. A nonempty outlet participant set must unanimously opt in before unread provided hooks are omitted. Every evaluated chain candidate participates, including declined candidates; empty, mixed, legacy, all-declined and resident raw-fallback compositions retain default delivery. Actual tracked sources remain subscribed regardless of policy. Root, Session, Header and Chat opt in; the composer and InputBar retain default delivery. The [chat node decision](2026-10-06-read-tracked-chat-node-renderers.md) owns audited plain-function opt-ins; other descendants retain defaults.

Notification revisions, synchronous fan-out, mutable-handle semantics, registry/locale/provider subscriptions, detached rendering, connection rereads and teardown remain unchanged. The [consumed-revision decision](2026-10-06-consumed-revision-outlet-delivery.md) owns those guarantees. [Draft persistence isolation](2026-10-06-chat-draft-persistence-projection.md) independently owns synchronous backing-store writes.

## Alternatives considered

**Split the element without changing subscriptions.** Two fresh live runs retain Root once, Session twice and Chat three times per frame-scheduled draft delivery. Provided-hook subscriptions still connect the input source to every outlet.

**Remove unread provided hooks globally.** Legacy and dynamic plugin entries retain an all-provided notification contract; read tracking alone does not establish that they opt into a narrower dependency assertion.

**Filter by selected-value or session identity.** Session and location handles mutate internally. Equal references do not establish unchanged content, and this would also alter source notification guarantees.

**Pass partial input currency.** Business contributions consume complete current InputState and session values; narrowing their props trades correctness for fewer notifications.

## Consequences

Four genuine native character keypresses each deliver zero Root, Session and Chat props applications both synchronously and after two animation frames. The prior measured frame path delivers one, two and three respectively. The composer receives one and InputBar two per key. The 87 measured descendant native callbacks motivate the separate [chat node delivery decision](2026-10-06-read-tracked-chat-node-renderers.md), which owns their current coverage. These are delivery counts, not FPS, latency or total render-work claims.

Fresh production boot retains all 92 active fibers. Actual Overview/Chat changes notify two simultaneous store subscribers. Inspecting an existing tool call renders the real Trajectory route. Current delegated InputZone callbacks receive all six input fields and the actual complete session; a real 12-line draft grows the same seat from 144 to 408 pixels, with matching root CSS, after disconnect/reconnect. The same textarea and seat remain resident; original draft, storage bytes, caret and local geometry are restored and probes removed.

The actual Trajectory route emits repeated `ResizeObserver loop completed with undelivered notifications` errors during inspection. Their cause is unclassified and remains open; the successful typing and reconnect checks do not establish an error-free GUI. Pending approvals, running/subagent takeovers and a fresh no-session workspace transition are not exercised by these gates. No model spend or manufactured session fixtures establish coverage.
