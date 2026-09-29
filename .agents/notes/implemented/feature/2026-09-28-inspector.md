# Agent Note: inspector — loopback-only Chrome DevTools target over the Host realm

Status: implemented

## Problem

dsh's `packages/experimental/inspector` is a Host debugging surface freddie has no equivalent for: a CDP hub putting one Host and its browser Clients into Chrome DevTools — Console evaluation, Host Sources/breakpoints, `globalThis.fetch` capture, and a Cordis Context/Fiber tree in Elements — with all CDP state in a `node:worker_threads` Worker bound to loopback only. Freddie carried no CDP/DevTools surface at all (`DevTools|CDP|9222|/json/list` under `packages` matched only prose and gm's own lightpanda engine), and its two nearest neighbours are different things: `packages/extensions/tool-cordis` is a model-facing report/tool surface, and `packages/runtime-diagnostics/invariants` asserts relationships rather than exposing an interactive debugger.

The port was gated by a security posture, not by parity: two commits before it, freddie's tree carried a supply-chain dropper (removed in `c134c5e`), and this surface exposes remote code evaluation, source/breakpoint control, and `fetch` capture. An unauthenticated or network-exposed instance is full remote code execution on the Host.

## Decision

**Portable, with the security posture tightened rather than matched.** Upstream source read from `raw.githubusercontent.com/deepseek-ai/deepseek-harness/master` (`api.github.com` was rate-limited, so raw paths and HTML tree pages were used): `package.json` (depends on `ws ^8.21.0`), `README.md`, `src/index.ts`, `src/host/plugin.ts`, `src/worker/server.ts`, `src/host/bridge/controller.ts`, `src/host/inspection/network.ts`.

Upstream's own README states the delta that governed the port: the fetch journal records "the complete URL, all request and response headers, request body, response body", and "It does not redact credentials, cookies, query values, or payloads." It also takes `host` from configuration. Freddie keeps its stricter behaviour wherever upstream's defaults are weaker.

## Port

New package `packages/runtime-diagnostics/inspector` (`@freddie/freddie-inspector`), buildless ESM plain JS with JSDoc, 12 sources:

- `shared.js` — vocabulary shared by Host and Worker (loopback hosts, `TOPIC`, `FRAME`, `REDACTED`).
- `options.js` — `assertLoopback()`, `isLoopbackAddress()`, and `resolveInspectorOptions()`, the single decision point. `host` is a security constant, not a deployment field, and is absent from `Config`.
- `redact.js` — header substring deny-list, query-name deny-list, URL userinfo, and a body pattern scanner.
- `host-source.js` — `HostSource` over a transferred `MessagePort`; non-blocking, drops the oldest record on overflow.
- `fetch-capture.js` — `installFetchObserver()`; hands the caller the original `Response`, reads clones for bodies.
- `cordis-tree.js` — `collectCordisTree()` over `registry.values()` and `runtime.fibers`.
- `ws.js` — owned RFC 6455 handshake and framing, replacing upstream's `ws` dependency.
- `cdp.js` — `CdpHub` (forwarded `Runtime`/`Debugger` domains, local `Network`/`DOM`/`Page`/`Target`) and `ElementsBackend`.
- `worker.js` — the loopback HTTP/DevTools endpoint, the retained fetch journal, and the bind verification.
- `index.js` — Cordis function plugin and `startInspector()`.
- `invariant.js` — `./invariant` companion.

Also: new group README `packages/runtime-diagnostics/README.md` (the group had none), one row in `packages/README.md`, and a hand-maintained entry in `docs/config-catalog.md` (its generator and freshness check no longer exist).

**No new npm dependency.** `src/ws.js` owns the WebSocket transport upstream buys with `ws`. This contradicts the repository's "prefer maintained dependencies when they delete owned code" guidance and is recorded as a deliberate deviation in the package README's Dev Note: ~230 lines of well-specified transport with exactly one consumer, added to a package whose entire subject is not widening the attack surface.

## Key mechanism

A `node:inspector.Session` created inside a Worker attaches to the **Worker's own isolate**. `Session.prototype.connectToMainThread()` is what reaches the Host main thread, and it is the one fact the design rests on: it was verified empirically before the port was written (a plain `connect()` probe returned the Worker's isolate, `connectToMainThread()` returned the Host's).

## Alternatives considered

**Depending on `ws` as upstream does.** Rejected: flagged-dependency rule, and it adds a transitive surface to the one package whose subject is attack surface. **Mounting as a `webServer` row with an injected Client bootstrap.** Rejected: freddie's port has no Client realm, so there is nothing to inject, and an injection with no reader is the unsupported public surface `packages/AGENTS.md` warns against — which is also why `inject` is empty and the package stands on its own port. **Porting the Client half** (upstream `lib/client.js`, `__DSH_INSPECTOR__`, the token+origin `/ingest` socket, Client Runtime/Sources RPC, Web Locks identity). Deferred: with no Client realm, `<clients>` stays empty in Elements and the deferral is documented in the README.

## Consequences

Verified live — real `@freddie/cordis` `Context`, real Worker, real loopback port, real WebSocket client, real `fetch` against a real local server. No stubs.

```
=== 1. non-loopback bind attempts ===
  host "0.0.0.0": refused -> inspector: refusing to bind "0.0.0.0" — the CDP target executes arbitrary Host code, so only 127.0.0.1, ::1, localhost are accepted and there is no field that widens this
  host "192.168.1.5": refused -> ...same...
  host "[::]": refused -> ...same...
  host "10.0.0.9": refused -> ...same...
  startInspector({host:"0.0.0.0"}) rejected -> inspector: refusing to bind "0.0.0.0" — ...

=== 2. real loopback bind ===
  httpUrl:               http://127.0.0.1:54781/
  webSocketDebuggerUrl:  ws://127.0.0.1:54781/devtools/page/363a6802-cd03-48df-9228-1c75fc7a1033
  /json/version:         {"Browser":"freddie-inspector/0","Protocol-Version":"1.3","webSocketDebuggerUrl":"ws://127.0.0.1:54781/devtools/page/363a6802-..."}
  connect 192.168.137.1:54781 -> ECONNREFUSED

=== 3. console evaluation over the real CDP socket ===
  raw mark: {"type":"string","value":"main-thread-21280"}
  Runtime.evaluate __INSPECTOR_VERIFY_MARK -> "main-thread-21280" (host mark is "main-thread-21280")
  Runtime.evaluate process.pid             -> 21280 (host pid is 21280)
  Runtime.evaluate 1 + 41                  -> 42
  mark set after start -> "live-value-read-from-the-host-main-thread!" (host value is "live-value-read-from-the-host-main-thread!")
  unimplemented method is a CDP error      -> Network.setUserAgentOverride: inspector: Network.setUserAgentOverride is not implemented by this Host target

=== 4. opt-in gate over a real Cordis context ===
  enabled:false -> ctx.inspector is undefined (nothing installed)
freddie inspector: devtools://devtools/bundled/devtools_app.html?ws=127.0.0.1:52789/devtools/page/a21826cc-...&panel=elements&noJavaScriptCompletion=true
  enabled:true  -> ctx.inspector present: true
  cordis tree:  {"realm":"host","truncated":false,"nodes":[{"kind":"context","children":[{"kind":"fiber","uid":1,"name":"inspector","state":"2","children":[{"kind":"context","children":[]}]}],"name":"root"}]}
  DOM.getDocument -> {"nodeId":1,...,"children":[{"nodeId":7,"nodeName":"inspector",...,"children":[{"nodeId":2,"nodeName":"host",...,"children":[{"nodeId":3,"nodeName":"cordis-context",...

=== fetch capture (captureBodies=false) ===
  caller still got its real Response: {"ok":true,"sessionToken":"RESPONSESECRET222"}
  url:      http://127.0.0.1:51900/v1/thing?token=[redacted]&keep=visible
  headers:  {"authorization":"[redacted]","content-type":"application/json","cookie":"[redacted]","x-api-key":"[redacted]"}
  postData: ""
  responseBody: ""
  request line (url+headers): CLEAN
  postData: CLEAN
  responseBody: CLEAN
  all CDP events this session: CLEAN

=== fetch capture (captureBodies=true) ===
  caller still got its real Response: {"ok":true,"sessionToken":"RESPONSESECRET222"}
  url:      http://127.0.0.1:56782/v1/thing?token=[redacted]&keep=visible
  headers:  {"authorization":"[redacted]","content-type":"application/json","cookie":"[redacted]","x-api-key":"[redacted]"}
  postData: "{\"user\":\"u\",\"apiKey\": \"[redacted]\"}"
  responseBody: "{\"ok\":true,\"sessionToken\": \"[redacted]\"}"
  request line (url+headers): CLEAN
  postData: CLEAN
  responseBody: CLEAN
  all CDP events this session: CLEAN
```

`CLEAN` means none of the six distinct secret tokens planted in the request (bearer, `x-api-key`, cookie, query `token`, JSON body field, response field) appeared anywhere in that surface. `ECONNREFUSED` on the machine's LAN address to the bound port proves the socket really is loopback-only rather than merely configured to be. `node scripts/publint-all.js`: `packages\runtime-diagnostics\inspector` → `All good!`.

No bundle or profile mounts it, and `enabled` defaults to `false`, so nothing changes for any existing composition.

## Every place upstream's defaults were tightened

1. **Bind address is not configurable.** No `host` field in `Config`; `resolveInspectorOptions` asserts loopback even for direct library callers.
2. **Loopback is asserted twice and verified twice.** Pre-bind assertion on the Host, pre-listen assertion in the Worker, post-bind verification of the address the OS handed back from `server.address()`, and a `socket.remoteAddress` check on every accepted upgrade.
3. **Fail safe.** A bind that cannot be made loopback fails the endpoint; there is no wider fallback.
4. **Opt-in.** `enabled: false`, absent from every default bundle and profile, and a mounted-but-disabled plugin installs nothing and logs the refusal.
5. **Redaction where upstream has none.** Credential-bearing headers, secret query values, and URL userinfo are replaced unconditionally with no opt-out.
6. **Bodies off by default.** `captureBodies: false`; a pattern redactor cannot prove a body carries no secret.
7. **Nothing captured is persisted.** The journal is Worker memory — no log, no mirror, no scratch file.
8. **`Runtime.evaluate` parameters narrowed** to what V8 understands, so DevTools-local parameters cannot be forwarded.
9. **Unknown methods answer a CDP error**, not a silent `{}`, so "not implemented by this Host target" is distinguishable from success.
