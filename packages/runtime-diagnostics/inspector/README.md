# @freddie/freddie-inspector

Opt-in, loopback-only Chrome DevTools inspection of one Host Cordis realm. It opens a single CDP target you can point `chrome://inspect` or a `devtools://` link at and get the Host itself: **Console** evaluation in the Host realm, **Sources** and breakpoints against real Host scripts, a **Network** panel of the Host's `fetch` traffic, and the Host's **Context/Fiber tree** in **Elements**.

All CDP state lives in a `node:worker_threads` Worker. The Host never hands a live object across the boundary: it projects its Cordis graph and its fetch observations into JSON records, and the Worker owns retention, the socket, and the protocol translation. The DevTools session inside the Worker attaches to the Host's **main thread** V8 inspector through `Session.prototype.connectToMainThread()`, which is what makes Console evaluation and breakpoints target the Host rather than the Worker's own isolate.

## Security posture

This package exposes remote code evaluation. `Runtime.evaluate` on this target is arbitrary execution in the Host realm, and the forwarded `Debugger` methods add pause, resume, and source control. Treat the endpoint as a root shell on the Host:

- **Loopback only, with no field that widens it.** There is no `host` config field. `resolveInspectorOptions` asserts the bind address against `127.0.0.1`/`::1`/`localhost` before the Worker spawns, the Worker asserts it again before it listens, and — because the bind is the boundary, not the request — the Worker re-checks the address the OS actually handed back from `server.address()` and re-checks `socket.remoteAddress` on every accepted upgrade. A bind that cannot be made loopback **fails the endpoint**; it never falls back to a wider one.
- **Opt-in.** `enabled` defaults to `false`, the base bundle mounts it only as `enabled: false` and no bundle or profile enables it, and mounting it while disabled installs nothing and logs the refusal.
- **Captured fetches are redacted.** Credential-bearing headers, secret query values, and URL userinfo are replaced unconditionally with no opt-out; bodies are not captured at all unless a composition sets `captureBodies: true`, and then they pass through a pattern redactor first. Nothing captured is written to a log, a mirror, or a scratch file — the retained journal is Worker memory and dies with the Worker.

## When to choose it

Choose it when a human is debugging a running Host and needs the Host's own realm in DevTools: reading live values, stepping through Host code, or watching what the Host fetches. Avoid it as an automation or telemetry seam — [`freddie-invariants`](../invariants/README.md) is the package for asserting Host relationships programmatically, and [`tool-cordis`](../../extensions/tool-cordis/README.md) is the model-facing report surface.

## Mount it

Mount it in any composition; it needs no web server and provides `ctx.inspector`.

```yaml
- name: '@freddie/freddie-inspector'
  config:
    enabled: true
    port: 9230
```

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Opt-in gate. `false` installs nothing. |
| `port` | `9230` | First port the Worker tries; an occupied port advances upward, `0` asks the OS for one. |
| `captureFetch` | `true` | Whether to observe calls made through the current global `fetch`. |
| `captureBodies` | `false` | Whether captured requests and responses retain bodies. Redaction is best-effort on bodies, so this is off until a composition accepts it. |
| `maxBodyBytes` | `65536` | Byte ceiling for one captured body. |
| `maxJournalBytes` | `67108864` | Total retained request and response body bytes. |
| `maxRetainedRequests` | `2000` | Active and completed requests the Worker retains. |
| `maxQueuedRecords` | `2048` | Records waiting in one producer queue before the oldest is dropped. |
| `maxQueuedBytes` | `8388608` | Encoded bytes waiting in one producer queue before the oldest is dropped. |
| `maxFrameBytes` | `131072` | Encoded bytes accepted in one transport frame. |
| `maxCordisNodes` | `2048` | Context and Fiber nodes admitted from one realm snapshot before truncation. |
| `cordisIntervalMs` | `1000` | How often the Host republishes its Cordis snapshot for Elements. An integer from `50` to `600000`; `resolveInspectorOptions` rejects anything else, and the publisher refuses a non-positive value instead of handing it to `setInterval`. |
| `startupTimeoutMs` | `10000` | Deadline for the Worker to become ready. |
| `stopTimeoutMs` | `5000` | Grace period before a stopping Worker is terminated. |

## Surface

| Kind | Name | Notes |
|---|---|---|
| Service | `ctx.inspector` | `{ endpoint, publish(topic, payload), cordis.getTree() }`; `endpoint` carries `httpUrl`, `webSocketDebuggerUrl`, and `devtoolsFrontendUrl`. |
| HTTP | `GET /json`, `/json/list`, `/json/version` | The target list Chrome's `chrome://inspect` and `devtools://` links read. |
| WebSocket | `/devtools/page/<targetId>` | The CDP endpoint; the path is exact and any other upgrade path is `404`. |

The plugin logs the `devtools://` URL at startup. Forwarded V8 domains are `Runtime` (evaluate with an allow-listed parameter set, properties, call function, console and exception events) and `Debugger` (script sources, breakpoints, pause/resume/step, blackboxing); `Network`, `DOM`, `Page`, `Target`, and `Log` are answered from the Worker's own retained state.

`publish` is for other Host packages that own an observation worth showing: it never waits on transport, and a full queue drops the oldest record rather than blocking the caller.

## Model Experience

None, as the package observes a Host realm for a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends a provider request.

## Known Limitations and Deferred Work

- **No Client realm.** Upstream puts the Host *and* every browser Client in one Elements tree over an injected `__DSH_INSPECTOR__` bootstrap and a token-gated `/ingest` WebSocket. freddie's port has no Client half, so `<clients>` is always empty and nothing is injected into the Web deployment. The Client Runtime/Sources RPC and its Web Locks identity are deferred with it.
- **Elements refreshes wholesale.** A changed Cordis snapshot emits `DOM.documentUpdated` and DevTools re-reads the document; upstream diffs at node level.
- **The Cordis tree is polled.** `framework/cordis` publishes no tree-change event a consumer can rely on, so the Host republishes on a timer. A debugger showing a stale graph is worse than one polling a cheap projection.
- **Context-only layers do not appear.** freddie's Cordis keeps no child-Context registry, so `extend()`, `isolate()`, and `intercept()` layers that own no fiber are invisible; only fibers and their owning contexts are projected.
- **Body redaction is best-effort.** A pattern redactor cannot prove a body carries no secret, which is why `captureBodies` defaults to `false`.

## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

**The security posture is deliberately stricter than upstream's, and that is the main adaptation.** dsh's inspector takes a `host` from configuration and can bind beyond loopback; its README states that the fetch journal records "the complete URL, all request and response headers, request body, response body" and that it "does not redact credentials, cookies, query values, or payloads". freddie's tree carried a supply-chain dropper two commits before this port, and this surface is remote code execution, so: no `host` field at all, loopback asserted pre-bind, re-verified post-bind from the bound socket, and re-checked on each accepted socket; `enabled` defaults to `false`; and header/query/userinfo redaction that is unconditional, plus bodies off by default. Where upstream's defaults are weaker, freddie keeps its own.

**No new npm dependency, and that is a deliberate deviation.** Upstream depends on `ws ^8.21.0`; `src/ws.js` owns the RFC 6455 handshake and framing this endpoint needs instead (text frames with continuation and mandatory client masking, ping/pong, close, a hard payload ceiling, and binary frames refused). That contradicts the repository's "prefer maintained dependencies when they delete owned code" guidance, and the trade is recorded here rather than hidden: the owned module is ~270 lines of well-specified transport that this endpoint is the only consumer of, and adding a dependency with its own transitive surface to a package whose entire subject is "do not widen the attack surface" was the worse choice. If `ws` ever becomes a workspace dependency for another package, this module should be deleted in favour of it.

**The Worker attaches to the Host main thread, not its own isolate.** A `node:inspector.Session` created inside a Worker attaches to the Worker's own isolate by default; `Session.prototype.connectToMainThread()` is the mechanism that reaches the Host. This was verified empirically before the port was written, and `src/cdp.js` documents it at the top because it is the one fact the whole design rests on.

**There is no `inject: ['webServer']`, unlike the triage's suggestion.** Upstream's Host row injects the Client bootstrap through `webserver/index-inject`. With no Client realm there is nothing to inject, and an injection with no reader is exactly the unsupported public surface `packages/AGENTS.md` warns about — so the package stands on its own loopback port and can also be mounted in a headless composition, which is useful when debugging one.

**`Runtime.evaluate` parameters are narrowed to an allow-list, and the narrowing is what makes it safer, not what makes it work.** `Runtime.evaluate` is deliberately *not* in `FORWARDED_METHODS`; it has its own `case` in `CdpHub.#dispatch` that copies only the keys in `EVALUATE_PARAMETERS` (`expression`, `objectGroup`, `includeCommandLineAPI`, `silent`, `returnByValue`, `generatePreview`, `userGesture`, `awaitPromise`, `throwOnSideEffect`, `timeout`, `disableBreaks`, `replMode`, `allowUnsafeEvalBlockedByCSP`, `uniqueContextId`) and drops the rest. An earlier revision listed it in both places, so the forward list won and the narrowing never ran; a client-supplied `contextId` reached V8 verbatim. Two facts were checked against a live V8 inspector session rather than assumed: a valid `contextId` is accepted (it is a real `Runtime.evaluate` parameter), only an unknown id errors (`Cannot find context with specified id`), and V8 silently ignores unknown parameters. So dropping `contextId` pins evaluation to the Host's default execution context and nothing more; the allow-list does not limit what code `expression` may run, which is why the loopback boundary above remains the actual control. Every other unknown method answers a CDP error rather than a silent `{}`, so a frontend can tell "not implemented by this Host target" from "succeeded".

**A forwarded method answers the inspector's whole result object.** `Session.post` hands its callback the CDP `result` object itself (`{ result, exceptionDetails }` for `Runtime.evaluate`, `{ debuggerId }` for `Debugger.enable`), so `#forward` resolves that object unchanged. An earlier revision unwrapped one level further, which answered a bare RemoteObject for `Runtime.evaluate` and an empty `{}` for every method whose result has no `result` key.

**The fetch wrapper hands back the original `Response`.** Body capture reads clones, cloned before the original fetch consumes the request stream, and is fire-and-forget; capture can neither change nor hold up an application request.

</details>

**Runtime invariant:** [`./invariant`](src/invariant.js) registers the package with an empty installer. Every fact a companion could check is already enforced where it is decided: the bind is asserted before the Worker spawns and verified again from the bound socket, so a non-loopback endpoint cannot exist to be observed; the fetch journal is Worker memory with no durable or mirrored copy, so it offers no cross-record relationship; and the Cordis projection is recomputed from live fibers, so it holds no mutable state of its own.
