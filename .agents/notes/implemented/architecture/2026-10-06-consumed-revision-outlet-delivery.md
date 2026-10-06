# Agent Note: Consumed-revision outlet delivery

Status: implemented

## Problem

A session notification can reach an ancestor and its descendants independently. The ancestor's synchronous diff already refreshes descendant props, but their source callbacks repeat that work. Stable conversation node and location handles mutate internally, so reference equality cannot identify whether an outlet consumed an update.

Connected prop applications also rebuild registry, locale and session-provider subscriptions even when their sources are unchanged. This setup churn is distinct from notification delivery and rendering.

## Decision

The static [ui-slots owner](../../../../packages/client/ui-slots/README.md#observable-read-tracking) shares one underlying subscription per observable source across renderer HMR generations. It advances a notification revision before fan-out and records each source's first revision read during an outlet render. A callback skips only a revision that the outlet already consumed. Connected outlets supply a dynamic DOM-depth key so ancestors receive delivery before descendants, independent of registration order. Equal keys retain registration order; additions during fan-out join every active traversal. Unread provided hooks still invalidate; selectors and their equality arguments do not suppress source delivery.

Detached factories build props and DOM without subscribing. Connection synchronously renders current state and binds reads. Reentrant render requests drain synchronously after the active render. Disconnect cancels pending work and unsubscribes. Removing the last adapted listener during fan-out defers underlying unsubscribe until traversal ends, preventing live-set remove/re-add cycles. Every adapted listener receives delivery even if another throws; the original single error or an aggregate of multiple errors propagates afterward.

Each outlet retains its three bindings while their source identities match. The registry binding also matches the slot key; locale and provider bindings compare the actual source rather than the cached host. A retained binding updates its render callback, preserving current props and connection state. Replacement unsubscribes the old binding, and disconnect clears all three. Every prop application and render still runs; source revisions, conditional reads and unread hooks retain their delivery rules.

This extends the [read-tracked outlet decision](2026-09-14-realtime-serving-and-outlet-subscriptions.md) without replacing its serving or stylesheet decisions. The [web client architecture note](2026-07-19-gui-web-client-architecture.md) retains the separation of runtime state from UI composition; its React selector bridge is not the current delivery contract.

## Alternatives considered

**Module-local adaptation.** Renderer HMR retains connected elements from earlier generations. Separate adapter and read-tracker caches duplicate source subscriptions and ancestor refreshes; the stable static owner preserves one shared notification revision.

**Selector equality filtering.** Stable mutable handles can retain identity across meaningful changes, and conditional or replaced selectors require additional invalidation machinery.

**Microtask render coalescing.** It changes synchronous input echoes, exception propagation, and teardown timing. Revision deduplication removes repeated work without changing notification timing.

**Skipping renders for unchanged binding identities.** Stable mutable faces and changing owner props do not provide complete invalidation evidence. Retaining a subscription avoids setup work without treating source identity as content equality.

## Consequences

A real 54-node production conversation had five ChatView and 412 SlotOutlet prop applications per content update with 190 raw session listeners. Connected-only subscriptions without ordered delivery still measured three and 244 after reconnect or renderer HMR. Ordered delivery measured one ChatView, 111 SlotOutlet and 40 context-row applications on every update across fresh boot, reconnect and renderer HMR, retaining two raw session listeners and 87–88 provide listeners as mounted outlets changed. No isolated timing gain is claimed: fresh-page measurements also discarded historical orphan dialogs. Removing the actual root left only the session publisher subscribed and no detached row renders; reconnect displayed the update received while disconnected. Session switching released the old adapter and acquired one on the new session. Nested notification, conditional and multi-source reads, provider replacement, error fan-out, active unsubscribe and registration during nested delivery passed on the actual production composition.

On a real 104-node history, two local reveal actions applied props 141 times to existing outlets. The second action contained 81 unchanged bindings on 60 owners: each of the three channels performed 81 subscribe/unsubscribe pairs. Binding reuse reduced those pairs to zero with the same prop-application counts and mounted-listener counts. No timing or FPS improvement is claimed. Removing and reconnecting the real root released and restored its owned listeners. Actual locale HMR replaced the locale face at the same cached host; its dependent slot declarations collapsed and redeclared while existing registry subscriptions continued receiving updates. Renderer HMR retained the native outlet class, and real session switches delivered current content before returning to the original 40-row tail. Both replaced locale faces released every listener and their shortcut providers disposed all effects. Final cleanup restored the original session, 40-row tail and scroll anchor without retained probes or slot errors.

Bare root-function invocation remains outside read tracking; custom-element prop application is tracked. Extending that boundary requires a separate detached-factory ownership audit.
