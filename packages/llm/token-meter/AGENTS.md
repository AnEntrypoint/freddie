# AGENTS.md — token-meter

## Rationale

- `src/estimate.js`: `ContentBlockMap` is merge-extensible; unknown blocks are priced conservatively as structural JSON under the fixed heuristic.
- `src/index.js` `static Config = z.object({})`: Schemastery preserves untrusted loader keys on an empty object schema; the public type excludes settings and `validateConfigKeys` rejects them.
- `src/index.js`: projection registration is an optional `ctx.inject` child, so compositions without the generic registry keep the standalone read shape. Readers catch up independently; the `session/event` sync only advances sessions already read, bounding read latency without creating state for unread sessions.
- `src/index.js` provider-anchor pricing: signed heuristic deltas are conservative only from an anchor at least as large as the matching full heuristic price (`providerTokens >= estimatedAnchorTokens` decides `usage` vs `estimated` baseline). `assistant/message` is surface-mandatory at every append/seed boundary, and session construction validates contiguous seqs, which is why the `oxlint-disable-next-line typescript/no-non-null-assertion` reads are safe.
- `src/surface-projection.js`: sessions recorded before the shadow-price protocol log replacements with no adjacent metering event; the bounded state cannot reconstruct that range's price, so they fold neutrally (replay degrades to drift instead of failing).
- `src/usage-projection.js`: a defined `fold.claim` is always freshly built, so its presence alone decides claim bookkeeping.
