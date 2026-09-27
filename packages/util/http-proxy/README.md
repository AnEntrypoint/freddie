# freddie-http-proxy

Outbound HTTP proxy support. Node's built-in `fetch` — what every LLM adapter, web search, and MCP-over-HTTP call resolves to — ignores `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`/`NO_PROXY` entirely; nothing in freddie read them even though `packages/boot/app-boot` already allowlisted all four as legitimate `.env` values under "network reach and trust." Without this package, freddie simply cannot reach the DeepSeek API (or anything else) from behind a corporate or LAN HTTP proxy. `apps/cli/src/bin.js` now resolves and installs the policy once, before any plugin mounts, covering every outbound caller in the process without touching their code.

## Surface

```js
import { installProxyFromEnvironment, proxyEnvironmentForChild, clearedProxyEnv, proxyRouteFor } from '@freddie/freddie-http-proxy'

// Once, at process start, before anything else makes a network call:
await installProxyFromEnvironment(environment, message => console.warn(message))

// A spawned child gets the user's own proxy values back (not this process's normalized ones):
spawn(cmd, args, { env: { ...process.env, ...proxyEnvironmentForChild() } })

// A replay harness that must not inherit any ambient proxy:
spawn(cmd, args, { env: { ...process.env, ...clearedProxyEnv() } })
```

`installProxyFromEnvironment` resolves `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`/`NO_PROXY` from the launch environment (`@freddie/freddie-launch-environment`'s `EnvLookup` shape), reports any rejected value (a SOCKS URL, a malformed URL — never thrown, since a proxy the harness cannot use must not stop the agent from starting), and installs undici's global dispatcher accordingly. A policy that proxies nothing installs a direct dispatcher rather than leaving a stale one in place. `./policy` is a separate, undici-free subpath export for a browser-worker runtime that needs the pure resolution logic (`resolveProxyPolicy`, `proxyForUrl`, `bypassesProxy`) without a Node transport.

Only `apps/cli/src/bin.js`'s `profile` mode installs a policy; `plugin`/`dump-config` modes make no network calls of their own. No worker thread installs one: `freddie-workflow-worker-thread` and `freddie-code-runtime-worker-thread` run model-authored scripts and must not receive a proxy URL that may carry credentials.

## Model Experience

None directly; this is transport plumbing beneath every network call, not a model-visible value itself.

#### KV Cache effect

None; nothing here enters a request prefix.

## Known Limitations and Deferred Work

- **Not yet consulted by anything that needs `proxyRouteFor` per-request** (a caller that must know a raw `fetch()` won't cover, or that needs the resolved proxy URL for its own transport). No such caller exists in freddie yet; this ships the primitive ahead of a concrete need, matching the package invariant that an explained empty companion is correct.
- **SOCKS proxies are refused, not translated.** A `SOCKS_PROXY`/SOCKS-scheme `ALL_PROXY` value is reported and that scheme connects directly — there is no bundled SOCKS-to-HTTP translation.
- **A worker thread's own `globalThis` is untouched.** A worker that needs the resolved policy must be handed one explicitly and install it itself; see the note above about why no worker does this automatically.
