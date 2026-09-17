# Agent Note: Grounded Dream-RSI replay

Status: implemented

## Problem

Exploration policies can improve from a discovery history, but a language model can mistake a hypothetical search branch for an executed result. Freddie also requires every model-visible input to be reconstructable from its session log.

## Decision

GM exposes `dream-replay`, an offline evaluator that accepts explicit worlds of recorded nodes and explicit traversal policies. A world records only node identifiers, realized score and cost, and child links. The evaluator rejects duplicate policies or nodes, missing references, malformed values, an absent baseline, and a policy that requests an unrecorded node. It scores the incumbent baseline with every challenger and selects a challenger only when its aggregate score is strictly higher; tied or lower challengers retain the incumbent.

`@freddie/freddie-tool-gm` exposes the evaluator as `gm_dream_replay`. Its normal tool-call and tool-result session records remain the authoritative replay receipt; `gm/progress` continues to record dispatch lifecycle state. `@freddie/freddie-dream-rsi-context` is an opt-in pre-step plugin. It derives a replay receipt from the preceding durable tool-call/result relation and injects a sourced directive only for a validated successful result. The directive identifies the selection, scores, bounded observed-node evidence, and its grounding limit. The plugin neither reads GM files nor invokes GM nor authorizes candidate-policy effects.

## Alternatives considered

**A learned or invented world model.** It would introduce outcomes that no actual discovery trace witnessed, defeating GM's evidence and execution boundaries.

**Changing Freddie's agent loop.** `agent/pre-step` already accepts durable request context through a plugin, so a loop change would duplicate an existing extension path and widen its blast radius.

**Reading `.gm` directly from Freddie.** The GM client is the process and protocol boundary. Parsing its state files would bypass session-specific daemon authority and format ownership.

**Selecting a challenger without evaluating the incumbent.** An incomparable score allows a regression to masquerade as improvement. Including the baseline makes retaining it the deterministic fallback.

## Consequences

Dreaming is exact over supplied recorded worlds and intentionally incomplete beyond them. Existing GM grounding, tool authorization, approval, and sandbox policies remain responsible for online effects. Deployments opt in through an overlay instead of changing the base bundle.
