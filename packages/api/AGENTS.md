# AGENTS.md — API controllers

## Rationale

- remote-stream client `createStream`: a failed `stream.close` is ignored because the Host reclaims the stream on its idle timer. A producer that ends while the consumer has not released it is a truncated read and surfaces as `ended(...)`. `stream/expired` from a poll means the Host reclaimed an idle stream, so `pollStream` ends without throwing (the wrapper then reports `ended(...)` like any producer finish the consumer did not release).
- remote-stream `require`: an unknown id is indistinguishable from an expired one (the Host has forgotten it), so both answer `stream/expired` and the caller restarts.
- remote-stream `parkProducerUntilDrainedOrDestroyed`: backpressure; the producer parks instead of buffering without bound until a poll drains the buffer or the stream is destroyed.
- remote-stream typert.host `next:result`: `frames` is `z.unknown()` because the carrier is generic; the frame shape belongs to the endpoint that opened the stream and is enforced when its producer emits.
- session-controller typert.host `follow`: frames do not ride the response; the endpoint registers its generator with the frame-stream carrier and returns the `streamId` a Client polls through `stream/next`.
- remote-stream client `apply` and `installRemoteStream`: the `stream` namespace is mounted only by this entry, never by the `api-remotes` assembly, because a second mount of the same direct methods is refused and disabling the `remote-stream` row must withdraw both halves. The namespace is read with `ctx.get('remote.stream')` after the mount and passed in, because `remote.stream` is a separately provided service that `ctx.remote.stream` may read only from a plugin listing it in `inject`, and this plugin is the one that provides it.
- session-controller client `apply`: `$stream` is read lazily because the carrier may be installed after this plugin and withdrawn before it; the model must answer `unsupported` rather than call a withdrawn factory.
- session-controller agent.js resume: a shared resume can publish an identity that subagent routing adopts before every waiter observes it, so waiters re-read `liveAgent` and apply the live ownership policy.
- session-controller history.js: constructor seed events emit no session/event notification, so a Session entering the store between the opening read and the subscription is backfilled from `firstSeqMissedBeforeSubscribing`.
- session-controller `index.js` constructor: the promotion drain is registered before `history` so reverse-order teardown closes every follower before awaiting already-admitted promotions.
- Typert loader imports the package’s exported `./typert` module and reads `TYPERT`; gateway service registration does not use source-comment tags. Preserve explicit manifests and registry ownership.
- gateway client mount: a fresh namespace installs its whole descriptor group synchronously inside its fiber's apply so a plugin parked on the namespace service never sees it without its methods.
- job-controller: a human kill is not the model's own, so the owning agent still gets the completion notice; roster reads are projections that never touch the agent's read cursor. `client/service` release closures bind the exact entry they were minted for, never the map's current occupant.
- job-controller `types.js` is intentionally empty: its wire types live in the hand-owned `typert.*.js` manifests.
- plugin-manager-controller: an entry is switchable only when nothing the request path or browser shell needs goes down with it; verdicts are re-derived per call from the live Loader/Fiber graph, and anything not provably leaf-like is refused. Its hand-listed protected modules have no injection edge (reached by route, manifest, or `ctx.get`).
- settings-controller: answers are rebuilt from `describe({ redactSecrets: true })` after a write so a redacted view can never be written back over secrets; credential verbs never return a value.
- workspace-files: every read resolves through `ctx.fs` and proves containment in a workspace root; with no session cwd and no sandbox fallback root the request is refused.
- remotes `remote-events.js`: the single forwarded-event allowlist shared by both compiler faces; `./types.d.ts` derives its type projection from it.
