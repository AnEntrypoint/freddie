# Agent Note: Explicit product usage events over OTLP/HTTP

Status: implemented

## Problem

Freddie could not report a product usage event. The only OTLP/HTTP path in the tree is [`freddie-session-telemetry-otel`](../../../packages/session/session-telemetry-otel/README.md), and it is a *capture* channel: it follows session events under a sharing mode (`FULL` / `FEEDBACK_ONLY` / `DISABLED`), replays the canonical log at recorded feedback, and ships prompts, tool calls, and file contents through a redaction waterfall. It has no API for "the deployment decided this counter matters" and, being consent-gated, is the wrong gate for one.

`codesearch` proves the absence rather than asserting it: `productTelemetry` scoped to `packages` returns **0** matches, and `createEventReporter` across the whole tree returns **0** matches outside this audit's scratch directory — freddie has neither the service nor the shared `otel` service upstream builds its adapter on.

Upstream `deepseek-ai/deepseek-harness` ships `@deepseek-ai/dsh-host-product-telemetry-otel`. This port brings it over as `@freddie/freddie-host-product-telemetry-otel`.

## Decision

### A separate channel, not a mode on the session seam

Session telemetry captures what a session *contained*; product telemetry submits what a caller *selected*. Folding them together would either make session-sharing consent the gate on unrelated product counters, or drag session content along with a counter. So this package owns its own `LoggerProvider` → `BatchLogRecordProcessor` → OTLP/HTTP log exporter pipeline and its own instrumentation scope, and reads no Session, account, credential, or device identifier.

### The pipeline is composed here, because there is no `otel` service to inject

Upstream's adapter is a thin policy layer over `ctx.otel.createEventReporter()`. Freddie has no such service, and inventing one to host a single consumer would be a shared abstraction with one caller. Instead this package composes the SDK exactly as the existing session backend does, and keeps ownership narrow: endpoint, identity, budgets, and the bounded shutdown wait. Batching, retry, queue bounds, and loss policy stay SDK behavior.

### No default endpoint

Upstream defaults `endpoint` to its own production collector and routes through a `channel` header. A default makes every deployment that mounts the plugin report to whoever owns that default, which is not a default freddie can inherit. `endpoint` is therefore schema-`required` with no fallback, and `channel` generalised into a `headers` map.

### Budgets are validated in the constructor, not the schema

The schema checks top-level types only; every bound is checked in the constructor so the error names the field. Two of those bounds exist because the SDK accepts a value it then mishandles: a non-positive `maxExportBatchSize` lets the processor splice empty batches without draining its queue, hanging `shutdown()` forever with records pending; and a delay above Node's timer ceiling is silently clamped to one millisecond, turning a batch interval into a hot loop.

### Shutdown is bounded and never rejects

The processor's `exportTimeoutMillis` wraps `exportCompleted` only, while shutdown first awaits `exporter.forceFlush()`, which can stay pending when the transport never obtains a socket. Hence an outer `shutdownTimeoutMillis` this package owns. It resolves rather than rejects: teardown of an analytics channel must not fail disposal of the composition that mounted it. A provider failure is reported through `ctx.logger.warn`.

## Deviations from upstream

| Upstream | Freddie | Why |
|---|---|---|
| `endpoint` defaults to `https://dsh-otel-collector.deepseeksvc.com/v1/logs` | required, no default | Reporting to a third party by default is not inheritable. Test and custom deployments name their own. |
| `channel: 'dsh_otel_report'` header | `headers` map (optional) | The channel is upstream's collector routing, not a product-analytics concept. Generalised so any deployment's collector routing works. |
| `ctx.otel.createEventReporter(...)` | composes `LoggerProvider` + `BatchLogRecordProcessor` + `OTLPLogExporter` directly | `createEventReporter` returns 0 hits across freddie — no shared `otel` service exists. The session backend composes the SDK the same way. |
| `CompressionAlgorithm` from `@opentelemetry/otlp-exporter-base` | bare `'gzip'` / `'none'` literals | Freddie does not carry that package and the exporter compares against the same two literals; the enum would buy a dependency for two strings. **No new npm dependency was added** — every imported package was already in the tree at the versions `freddie-session-telemetry-otel` pins. |
| `serviceName`/`serviceVersion` required | unchanged | Kept required rather than defaulting to `APP_IDENTITY`, which would add an `@freddie/freddie-llm` dependency for two strings. |
| `"main": "lib/index.js"` (built) | `"main": "src/index.js"` | Freddie is buildless. |
| TypeScript sources | plain JS + JSDoc, `./types` subpath | Freddie is buildless; the wire vocabulary stays importable without pulling the host pipeline into a client bundle. |

## Verification

Executed against real state on the real stack — a real `node:http` collector on loopback, a real Cordis `Context`, real plugin mount, real `emit()` calls, real disposal. No stubs, no mocks.

```
ctx key mounted: ProductTelemetry
provider composed: YES
instrumentation scope logger: YES
queued before drain: 0
exports captured after disposal: 1
--- export #1 ---
  POST /v1/logs content-type=application/json encoding=none x-exported=yes
  resource.service.name={"stringValue":"freddie"}
  resource.service.version={"stringValue":"9.9.9-verify"}
  scope="@freddie/freddie-host-product-telemetry-otel"@"0.1.1-rc.2"
  record time=1700000000000000000 observed=1790574582842000000 sev=9/INFO
    body={"stringValue":"a session started"}
    attributes=[{"key":"event.name","value":{"stringValue":"session.created"}},{"key":"surface","value":{"stringValue":"web"}},{"key":"count","value":{"intValue":3}},{"key":"beta","value":{"boolValue":true}},{"key":"nested","value":{"kvlistValue":{"values":[{"key":"plan","value":{"stringValue":"pro"}}]}}}]
  record time=1790574582843000000 observed=1790574582843000000 sev=13/WARN
    body={"stringValue":"user sent feedback"}
    attributes=[{"key":"event.name","value":{"stringValue":"feedback.submitted"}}]
gzip run: encoding=gzip decoded-first-key=resourceLogs
non-http endpoint: product-telemetry-otel: endpoint must be http(s), got file:
unparsable endpoint: product-telemetry-otel: endpoint is not a valid URL: "http://[bad"
batch > queue: product-telemetry-otel: maxExportBatchSize must not exceed maxQueueSize
zero budget: product-telemetry-otel: scheduledDelayMillis must be a positive integer no greater than 2147483647, got 0
non-integer budget: product-telemetry-otel: timeoutMillis must be a positive integer no greater than 2147483647, got 1.5
huge budget: product-telemetry-otel: shutdownTimeoutMillis must be a positive integer no greater than 2147483647, got 9000000000000
header injection: product-telemetry-otel: header "x-evil" is not a valid HTTP header value
non-string header: product-telemetry-otel: header "x-n" must be a string
unreachable collector: disposal resolved after 4ms (deadline 1200ms)
black-holed collector: disposal resolved after 1504ms (deadline 1500ms)
schema rejects missing endpoint: yes
schema accepts full config: {"endpoint":"http://127.0.0.1:49692/v1/logs","serviceName":"a","serviceVersion":"b","compression":"gzip"}
schema rejects bad compression: yes
```

The `./invariant` companion, mounted against the real `InvariantRegistry` service on a real Cordis context:

```
invariants service mounted: InvariantRegistry
companion name: host-product-telemetry-otel-invariant
companion inject: ["invariants"]
registration reserved: true
registrations: ["@freddie/freddie-host-product-telemetry-otel"]
duplicate registration: invariants: package "@freddie/freddie-host-product-telemetry-otel" is already registered
after disposal reserved: false
```

The companion reserves its exact npm package name, rejects duplicate ownership, and releases the reservation on disposal. Its installer is empty with a package-specific `No runtime invariant:` reason: record admission happens inside the SDK processor, which exposes no queue depth, dropped count, or export outcome to compare against what a caller submitted, and best-effort delivery makes an absent acknowledgement the expected state rather than corruption.


What that shows: the service mounts under `ctx.productTelemetry`; a real OTLP `POST /v1/logs` arrives carrying the configured `service.name`/`service.version` on the resource and both records under the package's own instrumentation scope; occurrence time is honoured (`1700000000000000000`) while observation time is assigned at submission; severity maps to 9/INFO and 13/WARN; attributes carry string, int, bool, and one-level `kvlistValue`; `gzip` compresses on the wire and decodes back to `resourceLogs`. Every misconfiguration rejects naming its field. The black-holed collector is the load-bearing line: disposal returned at 1504 ms against a 1500 ms deadline, so the bounded shutdown is observed, not asserted.

## Audit context

Part of the four-package deferral review. The other three findings: `preset/agent-preset` (overturned as a capability, declined as a port — freddie's preset model is a directory by design and its mount is path-based), `preset/agent-preset-registry` (deferral upheld: `ctx.agentPresets` at `packages/preset/agent-presets/src/index.js:114`), and `host/open-in-app` (genuine gap, ported separately).
