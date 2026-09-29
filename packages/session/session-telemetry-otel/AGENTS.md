# AGENTS.md — session-telemetry-otel

## Rationale

- `assertDrainableBatchSize`: the SDK accepts a non-positive `processor.maxExportBatchSize`, but shutdown's drain then splices empty batches without consuming the queue and provider shutdown hangs forever with records queued (verified against the installed SDK: 0 and -1 hang, 512 resolves). Misconfiguration fails at load instead.
- `SEMCONV_USER_ID` rides on the Resource, once per export batch, not per record: the collector aggregates by Resource and the id is process-stable. App identity also travels in the Resource; the transport user-agent stays the SDK's own.
- `NODE_TIMER_DELAY_CEILING_MILLIS`: Node clamps larger timer delays to 1 ms. It is a runtime limit, not a deployment default.
- `exporter` and `processor` pass to the SDK verbatim; rebuilding selected fields would silently ignore the rest.
- `enqueue` bodies are JSON by the persistence coordinator's append validation (non-JSON event data is rejected), which is exactly OTel's `AnyValue` subset.
- The seam's optional `flush()` hint is deliberately not implemented: forwarding it to `forceFlush()` would be the only source of concurrent flushes, whose interaction with shutdown's internal drain (concurrent-flush guard, provider flush timeout) silently drops tail records. Rationale and revival trigger: `.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.md`.
- `isCommittedRecord`: consent is the committed record in `session.events`, not an independently emitted bus value.
