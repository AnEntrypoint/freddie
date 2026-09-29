# @freddie/freddie-web-fetch-http

An anonymous public HTTP(S) `WebFetchProvider` for the harness [web capability seam](../web/README.md) (`ctx.web`). It retrieves a concrete URL and returns a status code plus bounded decoded content.

This is an **implementation** package: it registers a provider into `ctx.web`, it does not own the key and it does not register a model-facing tool. It is a function/namespace plugin (`inject: ['web']`).

## Responsibility split

The provider owns **safe resource retrieval**: URL validation, HTTP transport, redirect policy, a resource-backstop timeout, abort propagation, byte caps, charset decoding, content-type classification, and binary rejection. `@freddie/freddie-tool-web` owns **presentation** (HTML→markdown, truncation formatting). A non-2xx HTTP response is a *result* (status code + decoded body), not an error; `WebError` is reserved for failures to safely retrieve or represent the resource.

The provider's `timeoutMs` is a resource backstop for direct `ctx.web.fetch()` callers and misconfigured deployments, not the model-facing tool-call budget. [`freddie-tool-call-timeout-policy`](../../guard/timeout-policy/README.md) owns the `web_fetch` tool-call budget by arming `exec.signal`.

A shipping web-tool deployment sets the provider backstop above the tool budget, so model calls normally return `TOOL_TIMEOUT`. If the outer deadline reaches the provider first, the provider reports `WEB_ABORTED` and the outer policy replaces it with `TOOL_TIMEOUT`. `WEB_FETCH_TIMEOUT` therefore identifies a direct service caller whose provider budget elapsed.

## Transport hygiene

- Accepts only `http:` and `https:` URLs; rejects credentials in URLs (`WEB_BLOCKED_URL`) and over-long/malformed URLs (`WEB_INVALID_URL`). Refusal messages never echo the requested URL.
- Enforces a max URL length, response byte cap (`WEB_FETCH_TOO_LARGE`), decoded body character cap, timeout (`WEB_FETCH_TIMEOUT`), and redirect hop cap.
- Propagates the caller's abort signal (`WEB_ABORTED`) into the network request and the streaming read.
- Follows only **same-origin** redirects; a cross-origin redirect fails with `WEB_REDIRECT_BLOCKED`, requiring a fresh tool call (the model of Claude Code's WebFetch).
- Sends an explicit product `User-Agent`, never a browser disguise, and no cookies, `Authorization`, or other ambient credentials on any hop.
- Rejects unsupported (e.g. binary) content types with `WEB_UNSUPPORTED_CONTENT_TYPE`.

## Destination guard

Only public unicast destinations are reachable. A refusal is `WEB_BLOCKED_URL` whose message names the reason class (`loopback`, `private`, `link-local`, `shared`, `multicast`, `broadcast`, `unspecified`, `benchmark`, `documentation`, `reserved`, `transition`, or `reserved name`) and never the address.

- **Before any lookup** (`policy.js`): the URL parser has already folded decimal, hex, octal, short, percent-encoded and full-width IPv4 spellings into dotted form, so the literal is classified as written; `localhost`, `*.localhost`, `*.local`, `*.internal`, `*.localdomain`, `*.home.arpa` are refused by name (trailing dots and case ignored); userinfo is refused.
- **On the resolved answer set** (`network.js`, `address.js`): the provider resolves the host itself (`dns.lookup`, every A and AAAA record) and refuses the whole request when any address is non-public, when the answer is empty, or when an entry is malformed. Non-public covers `0.0.0.0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16` (cloud metadata), `172.16/12`, `192.0.0/24`, `192.0.2/24`, `192.88.99/24`, `192.168/16`, `198.18/15`, `198.51.100/24`, `203.0.113/24`, `224/4`, `240/4`, `::`, `::1`, IPv4-mapped IPv6 (classified by the embedded IPv4), IPv4-compatible IPv6, NAT64 `64:ff9b::/32`, 6to4 `2002::/16`, Teredo and the rest of `2001::/23`, `2001:db8::/32`, `3fff::/20`, `fc00::/7`, `fe80::/10`, `ff00::/8`, scoped (`%zone`) addresses, and everything outside `2000::/3`.
- **Pinned connection**: the request uses Node's `http`/`https` with a `lookup` that serves only the validated set, so a second DNS answer cannot redirect the connect. The URL hostname stays in `Host` and the TLS `servername`, so certificates still verify against the name.
- **Every hop**: each redirect target repeats scheme, literal, name, resolution, and pinning; a same-origin hop whose name now resolves privately is refused.
- **Bounded reads**: `Accept-Encoding: gzip, deflate`; gzip, deflate and brotli bodies are decoded through stream decompressors and the cap applies to the decompressed bytes, so a bomb stops at `maxResponseBytes` with the connection destroyed.
- **Fail closed**: an unresolvable name, empty or malformed answer, or unexpected input throws a typed `WebError`; there is no option that widens the guard and no allowlist of internal hosts.
- **Injectable resolver**: `new HttpFetchProvider(limits, lookup)` accepts a `dns.promises.lookup`-shaped function (default is the real one) so the resolution seam can be driven by a resolver you control.
## Config

| Key | Default | Meaning |
|---|---|---|
| `maxUrlLength` | `2048` | Maximum accepted request URL length. |
| `maxResponseBytes` | `5_000_000` | Maximum response body size in bytes. |
| `maxBodyChars` | `100_000` | Maximum decoded body length in characters. |
| `timeoutMs` | `30_000` | Fetch timeout within Node's timer range — a resource backstop for direct `ctx.web.fetch()` callers, not the model-facing tool-call budget (that is `freddie-tool-call-timeout-policy`). |
| `maxRedirects` | `5` | Maximum same-origin redirect hops (`0` follows none). |
| `userAgent` | `freddie/…` | `User-Agent` header. |

The numeric limits are validated at plugin construction: every cap except `maxRedirects` must be a positive finite number, and `maxRedirects` must be a non-negative integer. An invalid value throws rather than silently constructing a provider with nonsensical limits.

## Model Experience

Indirectly, through [`freddie-tool-web`](../tool-web/README.md), which places this provider's `maxBodyChars`-bounded decoded text or markdown-shaped HTML under its fetch-result wrapper and retains provider failures while redirects, headers, and transport mechanics remain hidden.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **No proxy support** — the provider connects directly to the validated address with Node's `http`/`https`, so it ignores the process-wide proxy the launcher installs from `HTTP_PROXY`/`HTTPS_PROXY`; a host that can only reach the internet through a proxy cannot fetch. Routing through a proxy would hand name resolution to the proxy and defeat the pinned-address check.
- **No allowlist for internal hosts** — internal, loopback, and private destinations cannot be enabled by configuration; there is deliberately no field for it.
- **NAT64 and 6to4 are refused wholesale** — an IPv6-only network whose DNS64 synthesizes `64:ff9b::/96` answers cannot fetch, even for public origins, because the embedded IPv4 cannot be pinned.
- **The guard covers this provider's own traffic only** — a redirect never leaves the origin, but a public page's contents are returned verbatim, and the guard says nothing about what the fetched text asks the model to do.
- **Truncation, not refusal, past the byte cap** — a streamed body or decompressed body that grows beyond `maxResponseBytes` is cut at the cap and flagged `truncated`; only a declared `Content-Length` over the cap is an error (`WEB_FETCH_TOO_LARGE`).
- **Only textual content decodes** — html/xhtml and `text/*`-plus-JSON/XML families; a missing `Content-Type` or any binary type throws `WEB_UNSUPPORTED_CONTENT_TYPE`, and text-extractable PDF decoding is named deferred work.
- **Charset comes only from the `Content-Type` header** (UTF-8 default) — an HTML `<meta charset>` declaration is ignored, and a declared-but-unrecognized charset label throws rather than falling back.
