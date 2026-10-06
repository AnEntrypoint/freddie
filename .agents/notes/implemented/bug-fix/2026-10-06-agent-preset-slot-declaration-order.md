# Agent Note: Preset contributions follow their slot declarations

Status: implemented

## Problem

The conversation controller becomes active before the conversation client finishes declaring its child slots. A fresh Web document reports an anonymous failed fiber when the preset contributor registers `conversation.hero.agentPreset` during that interval. The header-actions slot is declared separately, so waiting for the hero alone does not establish both dependencies.

Registration failure also prevents a grouped effect from returning its cleanup. Its raw session-list subscription, roster reader, and creator callback then retain the failed conversation scope.

## Decision

The preset contributor retains its conversation-service injection for the seat's operations. Each contribution independently uses the existing [slot declaration injection](../architecture/2026-08-05-slot-declaration-injection.md) lifecycle. Declaration collapse removes the contribution; redeclaration reinstalls it on the contributing scope. Direct registration remains fail-loud.

The grouped effect yields each subscription and cleanup as it acquires ownership. Cordis collects each disposer before advancing the synchronous iterable and unwinds collected effects if setup fails. Service-scope disposal clears roster and creator callbacks as well as subscriptions and declaration watchers.

## Alternatives considered

**Use controller readiness or client-module order.** The controller's consumers require its [actual readiness](2026-10-06-conversation-controller-publication-order.md), but service activation neither declares the slots nor follows declaration replacement.

**Fence both registrations on the hero declaration.** The header-actions declaration has a separate owner entry and can be absent independently.

**Keep one final cleanup return.** A registration failure before that return leaves raw subscriptions unowned.

## Consequences

The seat keeps its staged preset across presentation-only declaration replacement. Contributor disposal removes its waits, contributions, and service subscriptions. The existing slot lifecycle and controller-publication notes remain active because they own independent mechanisms; neither is superseded.

## Verification

A fresh document has all 92 nested fibers active, one hero contribution, and one preset header contribution. The real new-session screen displays the default chip; returning to the original session restores its preset label without a model turn.

One real conversation-plugin restart records each declaration becoming absent and returning with a new epoch and entry identity. One real preset-plugin restart stops its captured session-list subscription and leaves one replacement subscription active. Both contributions remain single; declaration-listener counts return to their original values. All nested fibers remain active, the original session and scroll position are preserved, the observation wrapper is restored, and only the owned verification tab is closed. These checks exercise the actual Loader entries and Cordis lifecycle, not constructed contexts.
