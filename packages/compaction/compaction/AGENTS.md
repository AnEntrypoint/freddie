# AGENTS.md — compaction

## Rationale

- `src/invariant.js` `install` `seed`: constructor-seed repair boundaries can precede the `session/end-seed` marker that proves an inherited orphan compaction stale. The inherited prefix is replayed with turn-boundary validation skipped while the open bracket's start seq is in `staleOrphanStartSeqs`, so a bracket about to be cleared cannot veto its own repair.

## Comment-sweep notes (compaction seam and backends)
- The durable `compaction/start` marker is the compaction lock until one `compaction/end`; a failed close deliberately leaves the unmatched start detectable. Ranges are surface positions, not seq order, and both edges must be tool-pairing balanced (`toolPairingBalancedBefore/After`).
- The replacement user message must use `compactCheckpointSource` with the transaction's `CompactionId`. `checkpoint.js` stays free of cordis imports so client/wire code can name the source.
- compaction-basic sends its summarization directive as the FINAL user message after the replayed system prompt, tools, and messages so the provider KV prefix cache is reused; `summarize()` is the only subclass hook.
- compaction-image-offload appends its selection event with the envelope's `ignorable` marker because the generated persistence catalog only names types present at the last `gen-persistence-catalog` run.
- compaction-tool-result-pruner slices text by code point (no surrogate splits; grapheme clusters may still split).
- Rationale: .agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md
