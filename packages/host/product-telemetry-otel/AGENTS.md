# AGENTS.md — product-telemetry-otel

## Rationale

- `src/index.js` exporter `compression`: left unset when the deployment names none, so the SDK's own `OTEL_EXPORTER_OTLP_*COMPRESSION` environment variables still decide. The bare literals are deliberate: importing `CompressionAlgorithm` would add an `@opentelemetry/otlp-exporter-base` dependency for two strings the exporter compares verbatim.
- `MAX_NODE_TIMER_DELAY_MILLIS`: Node clamps larger timer delays to one millisecond. It is a runtime protocol limit, not a deployment default.
- `instrumentationScopeVersion` is read from the package's own manifest, the single source of the scope version.
