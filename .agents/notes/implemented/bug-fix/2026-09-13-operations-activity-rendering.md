# Agent Note: Operations activity rendering

Status: implemented

## Problem

The sidebar counted every nested subagent as work directly started by the selected session. Operations also received structured durable conversation data where WebJSX requires text or virtual elements, so activity rendering could fail and hide the operational view.

## Decision

`indexSubagentDescendants()` indexes only immediate subagent children. `FreddieObservabilityDock` separately traverses the full descendant tree for Operations, labels direct and nested totals independently, and opens a selected child session through the runtime session owner.

Operations derives ledger text from the conversation-node contracts: tool nodes keep their root call or result, assistant nodes keep block arrays, and message nodes keep content blocks. The renderer selects text blocks only; structured durable values stay out of the WebJSX child list. When no unselected-child event arrived during the current connection generation, the row reports that the first observed action is pending while retaining its projected GM state.

## Alternatives considered

**Count every descendant in sidebar status.** This makes nested delegation look like work directly created by the selected agent and obscures the tree boundary.

**Render generic activity values.** Durable node data contains structured blocks, which WebJSX interprets as virtual elements and cannot render safely as text.

**Invent child activity from stale state.** A projection can show that a child is active without proving its latest operation; the UI keeps that distinction visible.

## Consequences

The sidebar remains an immediate-parent summary, while Operations retains the complete tree and session drill-down. The ledger presents durable text that is safe for WebJSX and leaves absent live-event detail explicit. Live HMR at the Freddie Web app renders the Overview, Subagents, ledger, direct/nested counts, and child-session navigation.
