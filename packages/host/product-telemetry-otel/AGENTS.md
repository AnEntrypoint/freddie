# AGENTS.md — product-telemetry-otel

## Rationale

- `src/index.js` exporter `compression`: left unset when the deployment names none, so the SDK's own `OTEL_EXPORTER_OTLP_*COMPRESSION` environment variables still decide. The bare literals are deliberate: importing `CompressionAlgorithm` would add an `@opentelemetry/otlp-exporter-base` dependency for two strings the exporter compares verbatim.
- `MAX_NODE_TIMER_DELAY_MILLIS`: Node clamps larger timer delays to one millisecond. It is a runtime protocol limit, not a deployment default.
- `instrumentationScopeVersion` is read from the package's own manifest, the single source of the scope version.
- This is the product-analytics channel, not session telemetry: it captures nothing on its own, an event leaves only when a caller submits it. It composes `LoggerProvider` -> `BatchLogRecordProcessor` -> OTLP/HTTP log exporter itself (no shared `otel` service exists). `endpoint` has no default so no deployment reports to a default owner. Bounds are checked in code, not schema, so errors name the field.
- Header values are validated with Node's header validator at mount (CR/LF is request smuggling). Non-positive batch size makes the SDK hang `shutdown()` with pending records; a delay above the timer ceiling becomes a 1 ms hot loop; both fail the mount.
- Queue admission is not delivery: memory-only, loses records on full queue, unreachable collector or exit. `event.name` travels as an attribute so receivers can group by it. Shutdown never rejects; OTel's export timeout wraps `exportCompleted` only while `forceFlush()` can hang without a socket, hence the package-owned deadline (which cannot cancel SDK transport).
- Invariant is empty: the SDK processor exposes no queue depth/drop/export outcome to compare. Attribute values are a scalar or one level of object over scalars (deeper is not an accepted OTLP `AnyValue`). `types.js` carries no runtime identity so browser callers can import it.
