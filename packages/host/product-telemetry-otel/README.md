# @freddie/freddie-host-product-telemetry-otel

Send selected product usage events to an OTLP/HTTP collector. Events carry a name, a one-line summary, an occurrence time, and scalar or one-level object attributes. Mounting the plugin collects nothing automatically; every event leaves because some caller submitted it, and delivery is best effort — queue admission is not a collector acknowledgement and not warehouse ingestion.

## When to choose it

Choose it for explicit product usage events: a deployment decides an event matters, names it, and submits it. Avoid it for session content — messages, tool calls, prompts — which is the [session telemetry seam](../../session/session-telemetry/README.md) and its [OTel backend](../../session/session-telemetry-otel/README.md), a separate channel with its own sharing mode and redaction waterfall. Avoid it for anything that needs an acknowledgement: this channel has none.

The two channels are deliberately not one. Session telemetry captures what a session contained and is gated on sharing consent; product telemetry submits what a caller selected and carries no session content at all. Sharing one pipeline would make "the user opted in to share this session" the gate on unrelated product counters, or make a product counter drag session content along with it.

## Use this package

Mount it with the application identity and the collector URL. There is no default endpoint and no default identity: both must be named.

```yaml
- name: '@freddie/freddie-host-product-telemetry-otel'
  config:
    endpoint: https://collector.example.com/v1/logs
    serviceName: freddie
    serviceVersion: !!js process.env.FREDDIE_APP_VERSION
    compression: gzip
```

| Field | Default | Meaning |
|---|---|---|
| `endpoint` | **required** | Full HTTP(S) logs URL |
| `serviceName`, `serviceVersion` | **required** | Application identity on the OTel resource |
| `headers` | `{}` | Extra headers reaching the collector, `name: value` strings |
| `compression` | SDK environment | `gzip` or `none`; omission honors `OTEL_EXPORTER_OTLP_LOGS_COMPRESSION` / `OTEL_EXPORTER_OTLP_COMPRESSION` |
| `maxExportBatchSize`, `maxQueueSize` | `512`, `2048` | Record-count limits; batch size cannot exceed queue size |
| `scheduledDelayMillis` | `30000` | Partial-batch export interval |
| `timeoutMillis` | `15000` | Exporter HTTP and retry deadline |
| `exportTimeoutMillis` | `20000` | Processor batch export deadline |
| `shutdownTimeoutMillis` | `21000` | Outer wait for shutdown; expiry reports possible loss |

`endpoint` has no default on purpose: a default would make every deployment that mounts this plugin report to whoever owns that default. Test and custom deployments name their own. `FREDDIE_APP_VERSION` in the example is a deployment-defined variable — no freddie package sets it — and an unset value fails the mount, because `serviceVersion` is required.

The 30-second interval batches product events; the exporter has a 15-second retry window inside the processor's 20-second batch deadline. The outer 21-second wait bounds plugin disposal, including SDK `forceFlush()` work the processor deadline does not cover. An unreachable collector can delay disposal for the full 21 seconds — and a black-holed one does: disposal returns at the deadline rather than whenever the transport gives up, which the live check in the Agent Note observed at 1504 ms against a 1500 ms deadline. A full 2,048-record queue needs four 512-record batches and may not drain before that deadline. Interactive compositions needing a shorter exit override these budgets; none of them guarantees delivery.

The configured `headers` and the SDK's protocol headers reach the collector, and the SDK's own environment reads still apply underneath them: ambient `OTEL_EXPORTER_OTLP_HEADERS` / `OTEL_EXPORTER_OTLP_LOGS_HEADERS` entries are merged in (a configured header wins on a shared name), and the `OTEL_EXPORTER_OTLP_[LOGS_]CERTIFICATE`, `_CLIENT_CERTIFICATE`, and `_CLIENT_KEY` files, when set, shape the TLS agent. `endpoint` is the exception: the configured URL always wins over `OTEL_EXPORTER_OTLP_[LOGS_]ENDPOINT`. A configured header value that would corrupt the request — one carrying a CR/LF, so request smuggling rather than a bad label — fails the mount instead of an export nobody reads; that check covers only the configured `headers`, not values read from the environment.

Consumers inject `productTelemetry` and call `emit()` with explicitly selected fields. Event names and field semantics belong to their product and analytics owners. The plugin reads no Session, account, credential, or device identifier; callers must exclude prompts, responses, file contents, credentials, and other unapproved values, because caller-selected strings are not redacted here — the plugin does not decide product disclosure or consent policy.

## Service: `ProductTelemetry` (ctx key: `productTelemetry`)

- `ctx.productTelemetry.emit(record): void` — Enqueue one selected product event without waiting for network delivery. `record` is `{ name, body, time?, severity?, attributes? }`. The event name travels as the `event.name` attribute, so a receiver groups by it while the body stays a readable one-line summary. Occurrence time is the caller's `time` in epoch milliseconds and defaults to submission time; observation time is assigned here. Severity defaults to `info`.

### Field mapping

`name` → the `event.name` attribute; `body` → the log record body; `time` → `timestamp` with `observedTimestamp` assigned at submission; `severity` → `severityNumber`/`severityText` (INFO 9 / WARN 13 / ERROR 17); `attributes` verbatim, merged after `event.name`, so a caller attribute keyed `event.name` would replace the event name — do not use that key. Records land under one instrumentation scope, `@freddie/freddie-host-product-telemetry-otel`, versioned from this package's own manifest, over a resource carrying `service.name` and `service.version` — both once per export batch rather than per record, since the collector aggregates by resource and neither changes while the process runs.

## Model Experience

None, as the plugin exports explicit analytics records without contributing model context.

#### KV Cache effect

None; event submission does not change model requests.

## Known Limitations and Deferred Work

- **The queue is memory-only** — overflow, network failure, and process exit lose events. There is no durable outbox and no warehouse acknowledgement.
- **The SDK batches by record count, not encoded bytes** — callers must keep records within the collector's own request limit and choose batch sizes the receiver accepts.
- **Caller-selected strings are not redacted** — this package submits what it is handed and owns no disclosure policy.
- **No shared `otel` service** — upstream builds this adapter on one; freddie has none, so this package composes the SDK pipeline itself, exactly as [`freddie-session-telemetry-otel`](../../session/session-telemetry-otel/README.md) does. A second OTel consumer in one process therefore builds a second pipeline rather than sharing one, and no global OTel provider is installed.
- **The invariant companion installs no check** — record admission happens inside the SDK processor, which exposes no queue depth, dropped count, or export outcome to compare against what a caller submitted, and delivery is best effort, so an absent acknowledgement is the expected state rather than corruption.

## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The three porting decisions that are not visible in the code:

1. **The default endpoint was dropped.** Upstream defaults to its own production collector plus a `channel` routing header. Reporting to a third party by default is not a default freddie can inherit, so `endpoint` is required with no fallback and `channel` became the general `headers` map.
2. **`compression` is a bare string.** Upstream imports `CompressionAlgorithm` from `@opentelemetry/otlp-exporter-base`. Freddie does not carry that package, and the exporter compares against the same two literals, so the enum would have bought a dependency for two strings. No new npm dependency was added: every package this imports was already in the tree at the versions `freddie-session-telemetry-otel` pins.
3. **Shutdown never rejects.** Teardown of an analytics channel must not fail disposal of the composition that mounted it, so the deadline resolves rather than rejecting and a provider failure is reported through `ctx.logger.warn`.

</details>
