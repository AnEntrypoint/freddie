# Agent Note: Grounded Dream-RSI replay

Status: implemented

## Problem

Exploration policies can improve from a discovery history, but a language model can mistake a hypothetical search branch for an executed result. Freddie also requires every model-visible input to be reconstructable from its session log.

## Decision

GM exposes `dream-policy-register`, `dream-discovery-record`, `dream-world-seal`, and `dream-replay`. Policy registration establishes one session-owned deployed baseline and named candidate policies. Discovery records bind a successful completed GM dispatch to a target, evaluator score, measured cost, policy, and optional parent relation. Sealing accepts only same-session discovery IDs, derives node values from those records, and persists an opaque same-session world ID. Replay accepts only same-session registered policy IDs and sealed world IDs; it never accepts caller-supplied outcomes or policy definitions. The evaluator rejects duplicate policies or nodes, missing references, malformed values, an absent deployed baseline, and a policy that requests an unrecorded node. It scores the incumbent baseline with every challenger and selects a challenger only when its aggregate score is strictly higher; tied or lower challengers retain the incumbent.

GM derives an evaluator receipt internally from a completed session-bound dispatch ledger entry: target is the recorded verb/fingerprint pair, score is the recorded success outcome, and cost is the recorded operation count. GM re-derives those values when it consumes the session-owned receipt, so project-local state cannot invent a result without a matching ledger record. `@freddie/freddie-tool-gm` exposes policy registration, evaluation, discovery recording, world sealing, and replay as typed tools. `@freddie/freddie-dream-rsi-context` defaults to enabled only in the explicit Dream-RSI bundle. It derives a replay receipt from the preceding durable tool-call/result relation and injects a sourced directive only when the receipt exactly matches the replay call and validated successful result. The directive identifies the selection, scores, bounded observed-node evidence, and its grounding limit. The plugin accepts only opaque identifiers before rendering them, and it neither reads GM files nor invokes GM nor authorizes candidate-policy effects.

## Alternatives considered

**A learned or invented world model.** It would introduce outcomes that no actual discovery trace witnessed, defeating GM's evidence and execution boundaries.

**Changing Freddie's agent loop.** `agent/pre-step` already accepts durable request context through a plugin, so a loop change would duplicate an existing extension path and widen its blast radius.

**Reading `.gm` directly from Freddie.** The GM client is the process and protocol boundary. Parsing its state files would bypass session-specific daemon authority and format ownership.

**Selecting a challenger without evaluating the incumbent.** An incomparable score allows a regression to masquerade as improvement. Including the baseline makes retaining it the deterministic fallback.

## Consequences

Dreaming is exact over supplied recorded worlds and intentionally incomplete beyond them. Existing GM grounding, tool authorization, approval, and sandbox policies remain responsible for online effects. Deployments opt in through an overlay instead of changing the base bundle.
