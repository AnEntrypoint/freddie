# @freddie/freddie-remote-stream

Frame-stream carrier for Typert Remote endpoints. freddie's `/api` RPC is unary — one POST, one JSON response — and its only WebSocket downlinks are the two fixed mux and host-event paths, so an async generator cannot cross the wire. This package supplies the missing half as a long-poll: a Host business method registers its generator and returns an opaque `{ streamId }`; the Client pumps frames with `stream/next` polls and releases the stream with `stream/close`. No new socket, no new route, no change to `packages/client/connection`.

## Host service: `RemoteStreamService` (ctx key: `remoteStream`)

`RemoteStreamService extends TypertRemoteService` with namespace `stream`.

| Method | Request | Result |
|---|---|---|
| `open(name, factory, options)` (in-process, not a Remote method) | producer factory plus `{ signal?, frame?, maxBufferedFrames?, idleTimeoutMs? }` | `{ streamId }` |
| `stream/next` | `{ streamId, maxWaitMs? }` (`signal`) | `{ frames: unknown[], done: boolean }` |
| `stream/close` | `{ streamId }` | `{ closed: boolean }` |

`open` awaits the producer's first frame before returning the id, so an unknown Session or a bad request fails the opening call, not the first poll. Every frame is checked against the optional `frame` schema before it is buffered; a rejected frame fails the stream. A producer that fills its buffer is paused until a poll drains it.

Bounds (`src/config.js`): one poll waits at most 20 s, at most 128 streams are open at once (`stream/unavailable` beyond that), a stream buffers 256 frames, a poll returns at most 64, and a stream nobody polls for 30 s is destroyed. Only one poll may be in flight per stream (`stream/busy`).

Failure codes: `stream/expired` (unknown, closed, finished, or idle-destroyed id — indistinguishable by design, the caller restarts), `stream/invalid`, `stream/busy`, `stream/unavailable`, `stream/aborted`. A producer error is delivered by the next poll and destroys the stream.

## Client factory: `installRemoteStream(remote)`

The Client entry (`@freddie/freddie-remote-stream/client`) mounts the `stream` namespace and installs `remote.$stream(options)`, returning a disposer that withdraws the factory. `installRemoteStream(remote, namespace)` takes the mounted `stream` namespace service as its second argument. `options` is `{ name, open(signal), ended(accepted), carrierFailed? }`; the result is an async iterable of frames carrying `dispose()`. Iterating opens the stream, polls, and calls `stream/close` on `dispose()` or early exit. A Remote model that finds no `$stream` reports `unsupported`.

Cordis returns a fresh accessor on every `ctx.remote` read, so the installed factory is never `===` the one read back; ownership is tracked in a `WeakMap` keyed by the remote instead of by function identity.

## Capability classification

The frames are generic: the carrier inspects nothing and carries whatever the registering endpoint produces. What a `streamId` grants is therefore the capability of the endpoint that minted it. `session.follow` and `session.control` mint streams whose frames are Session transcript content and projection state — the same class as `session/page` and `session/projections`. `stream/next` and `stream/close` themselves take only an unguessable `randomUUID` handle and answer `stream/expired` for anything else, but a deployment that mounts this package alongside a session-content endpoint must treat `stream/next` as transcript-reading and pin it accordingly. Streams are not bound to the connection that opened them.

## Model Experience

None. The carrier registers no prompt, tool, or session event.

### KV Cache effect

None.

## Known Limitations and Deferred Work

- **Long-poll, not push.** Latency is bounded by one round trip after a frame is produced; a third downlink WebSocket would remove that but requires an edit to `packages/client/connection/src/index.js`, which this package deliberately does not need.
- **Composed by the web bundle only.** `packages/bundle/web-app/cordis.patch.yml` mounts `@freddie/freddie-remote-stream` once, and that one row supplies both the Host service and the browser entry, which owns the Client `stream` namespace; the `api-remotes` assembly does not mount it a second time. A deployment outside the web bundle that wants `session.follow` / `session.control` on the wire adds the row explicitly.
- **Frame shapes differ between consumers.** `job-controller` frames carry `{ value, accept }`; session and terminal frames are raw.
