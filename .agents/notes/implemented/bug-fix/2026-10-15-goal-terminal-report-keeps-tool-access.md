# Agent Note: Goal terminal reports retain tool access

Status: implemented

## Problem

A terminal autonomous goal report instructed the model to stop using tools even when the report exposed unfinished work or lacked the evidence required to describe the outcome accurately. That instruction turned a goal lifecycle mutation into a premature end to the same-session work.

## Decision

`@freddie/freddie-tool-goal` keeps the plugin-sourced `<goal_complete>` and `<goal_blocked>` wrap-up contexts, but they require follow-on tool work when it is necessary to make the user-facing report accurate. The goal state remains terminal; the context does not claim that all in-spirit work is complete or prohibit the ordinary tool loop from gathering and reporting evidence.

The terminal report continues to require direct address, grounded claims, outcome details, verification, concrete results, and any user review or next action. Direct-human goal mutations remain uninstructed.

## Alternatives considered

- **Preserve the no-tools instruction** — rejected because it prevents the model from correcting an incomplete terminal report in the same turn.
- **Restore `concludeTurn()`** — rejected because it removes the user-facing report and makes the lifecycle mutation itself a hard loop stop.
- **Keep the goal active until a report is written** — rejected because durable lifecycle state must record the model's terminal decision independently of the following reporting step.

## Consequences

- Terminal goal contexts no longer force a premature tool boundary.
- The ordinary agent loop can perform any necessary same-turn verification before reporting to the user.
- Goal completion and blocking remain model judgments; the context improves the evidence available for the report without changing lifecycle authority.

## Verification

`packages/goal/tool-goal/src/wrapup.js` contains the sole terminal context renderer. Its two branches preserve grounding and direct user reporting while replacing the former no-tools directive with an explicit requirement to continue and verify concrete work required for report accuracy. The rendered contexts are consumed only by `packages/goal/tool-goal/src/index.js` after a goal-round terminal mutation.
