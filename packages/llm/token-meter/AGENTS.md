# AGENTS.md — token-meter

## Rationale

- `src/estimate.js`: `ContentBlockMap` is merge-extensible; unknown blocks are priced conservatively as structural JSON under the fixed heuristic.
- `src/index.js` `static Config = z.object({})`: Schemastery preserves untrusted loader keys on an empty object schema; the public type excludes settings and `validateConfigKeys` rejects them.
- `src/index.js`: projection registration is an optional `ctx.inject` child, so compositions without the generic registry keep the standalone read shape. Readers catch up independently; the `session/event` sync only advances sessions already read, bounding read latency without creating state for unread sessions.
- `src/index.js` provider-anchor pricing: signed heuristic deltas are conservative only from an anchor at least as large as the matching full heuristic price (`providerTokens >= estimatedAnchorTokens` decides `usage` vs `estimated` baseline). `assistant/message` is surface-mandatory at every append/seed boundary, and session construction validates contiguous seqs, which is why the `oxlint-disable-next-line typescript/no-non-null-assertion` reads are safe.
- `src/surface-projection.js`: sessions recorded before the shadow-price protocol log replacements with no adjacent metering event; the bounded state cannot reconstruct that range's price, so they fold neutrally (replay degrades to drift instead of failing).
- `src/usage-projection.js`: a defined `fold.claim` is always freshly built, so its presence alone decides claim bookkeeping.
- Projection units keep O(1) state so persisted checkpoints do not grow: replacements ride the shadow-price protocol (the metering event immediately before a surface `replace` states the price of the replaced range); a replace with no armed claim folds zero delta, and a claim for a different range throws as a producer contract violation. The measurement service keeps the positional priced surface separately; both price via `estimate.js` so fully metered logs agree.
- Usage anchor reuse requires an identical canonical request envelope and a total no lower than that call's full heuristic anchor; otherwise the whole envelope and surface are repriced. The per-step `last` usage slot relies on adjacent usage reports per turn/step.
- `src/index.js` `oxlint-disable-next-line typescript/no-non-null-assertion` sits on session-seq log indexing: contiguous seqs index the durable log.
