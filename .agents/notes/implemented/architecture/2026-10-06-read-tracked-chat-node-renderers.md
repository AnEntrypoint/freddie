# Agent Note: Read-tracked chat node renderers

Status: implemented

## Problem

Composer isolation prevents layout and transcript redraws, but historical node outlets independently subscribe to every provided hook. A draft notification still refreshes context rows and assistant Markdown. Plain function registrations cannot use a native-element marker without changing their dispatch shape.

## Decision

The static ui-slots owner exposes `functionSlot(component, { subscriptions = 'all' } = {})`: a fresh synchronous wrapper forwards the original props and return value, carries subscription metadata, and adds no native tag. It does not mutate the original component, so another registration can retain default delivery. The existing renderer's nonempty unanimous participant rule applies without modification.

Only ContextMessageNodeView, AssistantNodeView, TurnTailNodeView and ToolCallTree registrations opt into tracked reads. ChatNodeSeat and ChatView retain actual session reads and unconditional owner updates. Assistant turn-data reads the authoritative session source; turn tails read session locations; tools read host description. Locale, provider and registry delivery retain their existing ownership. Toolview, assistant-action and turn-tail child compositions, unknown renderers and raw fallbacks retain default delivery.

The [composer subscription decision](2026-10-06-composer-read-tracked-subscriptions.md) owns the native opt-in and layout split. The [consumed-revision decision](2026-10-06-consumed-revision-outlet-delivery.md) continues to own synchronous delivery, mutable handles, ordering and lifecycle semantics.

## Alternatives considered

**Convert historical functions into native elements.** Extra wrappers and lifecycle owners are unnecessary; the functions already execute inside tracked slot rendering.

**Mutate the original function's policy.** A shared component can have registrations with different notification contracts. Registration-local wrappers keep that choice independent.

**Opt every row and child slot in together.** Unmeasured and foreign contributors retain the provided-hook contract. Each further opt-in needs its own dependency and live-delivery evidence.

**Compare node or session identities.** Stable handles mutate; identity does not establish unchanged content. Actual source notifications and owner props remain authoritative.

## Consequences

Four trusted character keypresses each invoke none of the four opted-in renderers. Native context-row updates drop from 20 to zero; assistant Markdown and MarkdownText drop from one to zero. Root, Session and Chat remain at zero. Composer receives one and InputBar two per key; legacy ToolRow still receives 18, feedback one and tooltip two. Instrumented native cohorts differ, so these per-tag observations do not establish an aggregate callback reduction, timing gain or FPS.

Actual earlier-history loading publishes two session notifications and expands 54 loaded nodes to 104; assistant and tail renderers each receive two calls. Switching to an existing session changes assistant text and its closing sequence from 1210 to 2088. Native Inspect publishes the selected call ID and renders its matching Trajectory row. A real locale restart rebinds the host; one listener remains on the old face, without an orphan attribution. A conversation restart replaces the four entries, advances the declaration epoch from three to five and retains two session-source listeners. Final cleanup restores the original session, Chat, empty draft, storage and caret with 40 mounted tail rows, all 94 observed fibers active and no retained probes.

No running session is available for an active-stream content or throughput witness. Closed-turn, history, session-switch and declaration/locale lifecycle delivery are exercised; active streaming remains an explicit coverage limit. This change does not remove independent legacy child updates or repair Trajectory's viewport and idle-render issues.
