# Agent Note: Trajectory native render owners

Status: implemented

## Problem

Ordinary session notifications replace Trajectory's bare DOM factory outputs. Remounting loses private search, folding, timeline and inspector state, and recreates their timer, observer and listener owners. Chat Inspect hands its real call id to a table, acknowledges the handoff, then loses selection when a later render replaces that table.

## Decision

The view registers as `webjsxSlot('freddie-trajectory-view')`. Its entry host retains the native element through ordinary renders. Table and Timeline factories return VNodes using `resolveElementTag()` and unconditional refs that apply complete current props. VNode identity retains private UI state, not data: every delivery still updates current records, callbacks, request details and selection inputs. Subscription policy remains default-all; no identity comparator or notification filter is added. The unused one-shot View factory is absent.

Session and registration keys remain intentional replacement boundaries. Resolved child tag names change with class aliases, so genuine source hot replacement constructs current classes and disconnects old owners. Existing disconnect paths cancel search timers, clean virtualizer observers and remove wheel listeners. Stylesheet hot replacement does not establish class replacement.

The [finite search-flush decision](2026-10-06-trajectory-finite-search-index-flush.md), [viewport decision](2026-10-06-trajectory-bounded-viewport-and-scroll-follow.md) and [custom-element registry](../architecture/2026-09-14-custom-element-hot-swap-registry.md) retain their independent cache, scheduling, layout, scroll-order and alias rationale.

## Alternatives considered

**Cache DOM output or compare session/layout identity.** Session handles mutate, fresh arrays can describe unchanged records, and callbacks must remain current. Retaining a VNode owner does not skip props delivery.

**Use logical tag names for retained child VNodes.** Patched `createElement()` resolves new construction, but a diff comparing an unchanged logical VNode type can retain an obsolete class. Resolved aliases express actual replacement identity.

**Change the generic renderer or subscription policy.** Existing native hosts and VNode reconciliation already provide the required ownership. This repair does not alter other entries' delivery contracts.

## Consequences

Real history grows one session from 62 to 123 records while retaining all three owners and the nonempty search query `GM`. Exact Chat Inspect selects its tool record and clears the handoff; another real history load from 54 to 104 retains the same owners and current inspector details. The selected row moves offscreen through virtualization, so inspector continuity is not a mounted-row claim. Genuine interval selection/clear, collapse and synchronous Assistant Message expansion retain current state without captured errors.

A real View source cleanup triggers same-document class replacement from v6 to v7. Old owners disconnect; an unfired search timer is cleared, Table observer cleanup executes and the old Timeline's terminal wheel event is removal. Switching sessions likewise disposes old owners and resets local search. Cleanup restores the original Chat session, draft, storage, caret and anchor, removes probes and exposes all 93 observed fibers active. Served source bytes match disk.

These are ownership and correctness observations, not FPS or input-latency measurements. Active streaming, Firefox and Safari are not exercised; registered tool views and raw-fallback input delivery are unchanged.
