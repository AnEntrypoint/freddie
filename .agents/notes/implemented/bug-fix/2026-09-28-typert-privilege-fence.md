# Agent Note: the Typert endpoints were routed around the loopback privilege pin

**Bug-fix.** The `/api` privilege pin in `packages/client/connection` was being checked in
the wrong place, so every namespaced Typert endpoint escaped it.

## The defect

`PRIVILEGED_METHODS` was consulted inside the **fallback** passed to
`connection.createSharedFetchHandler(API_PATH, fallback)`. But a Typert endpoint is claimed
by the gateway's RPC interceptor — `packages/api/gateway/src/index.js` registers
`connection.rpc.intercept('/api', …, { authority: 'trusted-host' })` — and the shared handler
dispatches to that interceptor **before** it consults the fallback. So the check never ran for
a namespaced endpoint. The set also held only dotted spellings (`settings.describe`), while the
controllers serve `settings/describe`.

Net effect: with `trustedHosts` configured, `settings/*`, `credentials/*` (including
`credentials/set`, which writes a secret), the workspace endpoints and `terminal/*` were all
reachable from any configured trusted host, while the legacy dotted routes they replaced stayed
pinned to loopback. The port had routed around a control that already existed.

## The fix

- The pin moved **in front of** the shared-channel dispatch, in `fetchHandler.fetch`.
- `apiMethodOf(request)` + `canonicalMethodName(method)` normalize `/` to `.`, so one list is
  authoritative for the legacy dotted routes and the namespaced ones alike. Without this the
  set silently misses every controller endpoint on punctuation alone.
- The set was then completed by **enumerating** every host manifest (71 endpoints across 16
  manifests) rather than by discovering gaps one at a time.

## What enumeration found that inspection had missed

- `dynamicCordisRunner` — **12** endpoints, not 11. Pinned whole: `runHostHalf` and `invoke` are
  host-side code execution with no model in the loop, and the verbs that look like bookkeeping
  (`resolveRequestRun`, `resolveInspectQuery`, `syncInspectManifest`, `settleUserRun`) are steps
  of the same activation pipeline. Pinning a subset leaves it reachable one verb over.
- `commands/execute` — runs a command handler in-process from caller-supplied text.
- `gm/*` — all five write `.gm/prd.yml` / `.gm/mutable*.yml` under the process cwd.
- `sessionArtifacts/share` — the one verb in that namespace crossing a session boundary.
- `sessionReferenceResolver/candidates` — rows carry every visible session's id, cwd and title.

## Deliberately left unpinned, and why it is recorded

`session.list`, `session.search`, `session.page`, `session.projections` disclose every session's
id, cwd and title — and `page` its content by id — so a configured LAN host can read the whole
conversation history. They stay reachable because the browser client **is** that caller: a LAN
deployment's own session list, search and transcript paging go through exactly these, so pinning
them breaks the product rather than closing a hole. This is the largest residual exposure on a
trusted-host deployment. `trustedHosts` is a DNS-rebinding fence, explicitly **not**
authentication, so closing it needs an auth layer, not another entry in the set. The file says
this at the point of omission so it reads as a choice.

## Verification

Real `POST /api/<ns>/<m>` against a live tree — real `Loader`, real `host-webserver` on
127.0.0.1, real `typert-registry`, real `api-gateway`, real `client-connection` with
`trustedHosts: ['harness.internal']`. Every pinned endpoint: **403 from `harness.internal`,
200 from loopback** — the pin fires on authority, not on method name. Controls: both event paths
still answer 426 with `upgrade: websocket`, an unclaimed endpoint is 404 (so 403 is not
blanket), and the unpinned benign `pluginInventory/list` answers `200 ok:true` from
`harness.internal`, still refused under `sec-fetch-site: cross-site`.

## Follow-up: the real `web` composition

Re-verified against the real composition with every controller mounted (138 served spellings: 80 Typert, 58 legacy). The set matched observed behaviour exactly except two legacy routes, `host.listDirectory` and `host.createDirectory`, whose namespaced twins were pinned while they were not: on a headless deployment the browse picker let a configured trusted host list any host directory and create one. Both are now pinned (62 entries).

`isTrustedApiRequest` also read only `hostname` from the Host header, so `evil.example@127.0.0.1` passed as loopback. A Host header is an authority alone, so userinfo, a path, a query or a fragment is now refused. A browser never sends one, so this is hardening rather than a rebinding fix.

Routes outside `/api` were checked too. The upload and open-in-app routes apply a frozen empty trust list, so they are loopback-only, and the events WebSockets use the same list as `/api`. Static, HMR and plugin-graph routes (`/plugins`, `/workspace`, `/styles`, `/vendor`, `/`) carry no Host, Origin or Fetch-Metadata fence. They serve buildless client source and the plugin graph and neither write nor launch; a rebound page could read them. Fencing them needs a trusted-host predicate exported from `connection`, not loopback-only, since LAN browsers load them.

Left unpinned on purpose, with the reasoning in the source comment: `session.*`, the session command verbs, `stream.next|close`, `subagent.*`, and `respond`, which settles a pending approval. A deployment that must keep approvals human-only needs an authentication layer.

## Lesson

A capability list that lives in one package while the capabilities are declared in many will
silently miss new declarations. Any new Typert host endpoint must be classified against this
set when it is added; the check cannot be relied on to catch it.
