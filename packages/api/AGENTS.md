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
