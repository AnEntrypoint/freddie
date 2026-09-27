# Agent Note: Outbound HTTP proxy support

Status: implemented

## Problem

Node's built-in `fetch` — what every LLM adapter, web search call, and MCP-over-HTTP client resolves to — ignores `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, and `NO_PROXY` entirely; nothing installs a dispatcher that would honor them. `packages/boot/app-boot/src/index.js` already allowlisted all four names under its "network reach and trust" `.env` category, so a deployer could set them and freddie would silently accept the values into `process.env` — but nothing ever read them back out to configure a transport. Behind a corporate or LAN HTTP proxy (a common enterprise network shape), freddie cannot reach the DeepSeek API, or anything else, at all.

Comparing against `deepseek-ai/deepseek-harness`'s `util/http-proxy` package surfaced the same problem solved there: resolve one proxy policy from the launch environment once, and install it as undici's global dispatcher before anything else makes a request.

## Decision

New package `packages/util/http-proxy` (`@freddie/freddie-http-proxy`), split exactly as upstream: `policy.js` is pure, undici-free resolution (`resolveProxyPolicy`, `proxyForUrl`, `bypassesProxy`, `isLoopbackHost`) exported separately from `./policy` for a browser-worker runtime with no Node transport; `install.js` owns undici's global dispatcher, imported dynamically so the pure half stays loadable without it. `apps/cli/src/bin.js`'s `profile` mode calls `installProxyFromEnvironment(environment, report)` once, right after `loadLayeredEnv('freddie')` resolves the launch environment and before `runProfile` mounts any plugin — covering every outbound caller in the process (LLM calls, `@freddie/freddie-web-search-browser`/`-exa`, `mcp-client` over HTTP, OTel telemetry) without changing any of their code. `plugin`/`dump-config` CLI modes make no network calls of their own and install nothing.

A scheme's own environment variable wins, then `ALL_PROXY`, then — for HTTPS only — the resolved HTTP proxy, matching undici's own precedence so the installed dispatcher and this package's `proxyForUrl` never disagree about one URL. `LOOPBACK_NO_PROXY` (`localhost`, `127.0.0.1`, `::1`, `[::1]`) is always merged in, since a proxy that also serves the harness's own loopback traffic (the Web UI, `ConnectionController`, local test servers) would turn every local request into a routing loop. A SOCKS proxy or malformed URL is reported through `report()` and that scheme connects directly, rather than throwing — a proxy value the harness cannot use must not stop the agent from starting.

No worker thread installs a policy: `@freddie/freddie-workflow-worker-thread` and `@freddie/freddie-code-runtime-worker-thread` run model-authored scripts, which must not receive a proxy URL that may carry credentials.

## Alternatives considered

**Use undici's own `EnvHttpProxyAgent`.** Rejected: with no `HTTPS_PROXY` present it silently reuses the HTTP proxy for `https:` origins, which would tunnel a scheme this package deliberately keeps direct after refusing a SOCKS or malformed value named for it — the actual route and the reported diagnostic would then disagree about what happened.

**Read the proxy variables lazily, per outbound package, instead of one process-wide install.** Rejected: every outbound caller (LLM adapters, web search, MCP, telemetry) would need its own resolution and its own undici import, multiplying the SOCKS/malformed-URL/loopback edge cases this package now handles once. A single global-dispatcher install covers `fetch` everywhere for free.

**Install the policy inside a plugin (mounted through `cordis.yml`) instead of the CLI launcher.** Rejected: composition mounts after the launch environment resolves, but before then nothing has made a request yet either — the plain, unconditional call in `bin.js` needs no plugin lifecycle, config schema, or injection to serve a value that has exactly one answer per process.

## Consequences

Freddie can now be deployed behind a corporate or LAN HTTP proxy; previously every outbound request would attempt a direct connection regardless of `HTTP_PROXY`/`HTTPS_PROXY`. Verified live: `resolveProxyPolicy` against `HTTP_PROXY`-only, `ALL_PROXY`-with-per-scheme-override, and SOCKS-refusal environments; `proxyForUrl`/`bypassesProxy`/`isLoopbackHost` against an external DeepSeek-shaped URL, a loopback URL, and a `noProxy`-listed subdomain; a full `installProxyFromEnvironment` → dispatcher-replaced → `proxyEnvironmentForChild`/`clearedProxyEnv` → dispose → dispatcher-restored round trip against undici's real `getGlobalDispatcher()`; and a full CLI headless boot through the modified `bin.js` with no proxy configured, confirming the direct-policy path leaves normal networking (including a real DeepSeek API call) untouched. `pnpm run publint` passes (225/225 packages).

`proxyRouteFor` (the per-request route/dispatcher pair for a caller whose own transport a plain `fetch()` doesn't cover) ships with no consumer yet — no such caller exists in freddie today, matching the package invariant that an explained empty companion is correct rather than a reason to withhold the primitive.
