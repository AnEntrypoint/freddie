# Agent Note: Operations activity rendering

Status: implemented

## Problem

The sidebar counted every nested subagent as work directly started by the selected session. Operations also received structured durable conversation data where WebJSX requires text or virtual elements, so activity rendering could fail and hide the operational view.

## Decision

`indexSubagentDescendants()` indexes only immediate subagent children. `FreddieObservabilityDock` separately traverses the full descendant tree for Operations, labels direct and nested totals independently, and opens a selected child session through the runtime session owner.

Operations retains the latest semantic workflow, GM-progress, or tool-call event for each child as last-observed detail. Structured durable values stay out of the WebJSX child list. When no semantic event is available, the row reports that no action is available for the connection while retaining its projected GM state.

Overview projects current state instead of conversation transport. It shows the selected GM session, explicit planning and obligation counts when reported, and running descendants only. Child labels use stable session identifiers; assistant chunks, completion notices, generic event classes, raw tool payloads, and inactive GM projections stay out of the overview.

## Alternatives considered

**Count every descendant in sidebar status.** This makes nested delegation look like work directly created by the selected agent and obscures the tree boundary.

**Render generic activity values.** Durable node data contains structured blocks, which WebJSX interprets as virtual elements and cannot render safely as text.

**Invent child activity from stale state.** A projection can show that a child is active without proving its latest operation; the UI keeps that distinction visible.

**Keep the activity ledger on Overview.** An unbounded event stream cannot answer what GM is doing now.

**Treat an absent count as zero.** An unpublished GM snapshot is unknown state, not completed work.

## Consequences

The sidebar remains an immediate-parent summary, while Operations retains the complete tree and session drill-down. Its child detail is explicitly last observed rather than claimed current state. Overview stays concise and factual while focused views retain session status. Live HMR at the Freddie Web app renders the Overview, Subagents, direct/nested counts, and child-session navigation.
