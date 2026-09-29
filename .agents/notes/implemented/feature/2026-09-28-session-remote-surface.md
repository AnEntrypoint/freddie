# Agent Note: Session command surface and a streaming carrier for `session.follow` / `session.control`

Status: implemented

## Problem

The `session` Remote shipped only reads. `follow` and `control` were in-process async generators absent from both Typert manifests, and the Client model answered `unsupported`, because `/api` is unary (one POST, one JSON), the only WebSocket downlinks are the two fixed `MUX_EVENTS_PATH` / `HOST_EVENTS_PATH` paths in `packages/client/connection/src/api-path.js`, and `ClientRemoteService` had no `$stream` factory. Upstream's `SessionCommandController` (create, rename, fork, prompt, cancel, attachment, updateQueue, selectModel) was not on the Remote at all, and `session/search` threw from an abstract engine.

## Decision

1. **Long-poll frame carrier, no third downlink.** New `packages/api/remote-stream` (`@freddie/freddie-remote-stream`): Host `RemoteStreamService.open(name, producer, { signal, frame })` registers a generator and returns `{ streamId }`; the Client polls `stream/next` and releases with `stream/close`; `remote.$stream` is installed by `installRemoteStream`. Bounds are in `src/config.js`. Because it rides the existing unary `/api`, every existing boundary check (loopback pin, JSON assertion, Gateway trust) applies unchanged and `packages/client/connection/src/index.js` needs **no edit**.
2. **`follow` and `control` are registered in both manifests** returning `{ streamId }`; frames are validated by `src/frames.js` schemas before buffering.
3. **Commands delegate to the host gateway.** freddie already implements all eight commands once, in `ctx.apiProxy.sessions` (`packages/host/apiproxy/src/api-proxy.js`), which owns activation policy, preset conflicts, Workspace attach, and attachment authorization. `packages/api/session-controller/src/commands.js` calls it through `ctx.get('apiProxy')` and maps `{ ok: false, error }` to `TypertLookupFailure` with the gateway's own code. A direct import would create the cycle apiproxy -> `@freddie/freddie-api-remotes` -> session-controller; `ctx.get` adds no dependency. No gateway composed -> typed `session/commands-unavailable`. Codecs (`src/command-codecs.js`) are shared by both manifests so they cannot drift.
4. **Search** needed no new package: `@freddie/freddie-session-query-sqlite` already exists and is composed in `packages/bundle/base`. Where the engine is abstract or search is disabled, `session/search` now answers `session/search-unavailable`.
5. **Client Remote wiring** (`packages/api/remotes/src/client/index.js`) mounts the `stream` namespace first, then installs `$stream`, and the disposer withdraws it. The Client Session model reads `remote.$stream` lazily so a withdrawn carrier reports `unsupported`.

Defect found and fixed live: Cordis hands out a fresh accessor per `ctx.remote` read and re-wraps values read through it, so `remote.$stream === installedFactory` is never true and the identity-guarded disposer never deleted the factory. Ownership is now a `WeakMap` keyed by the remote.

## Deliberately not ported

- `media-references`: needs a new `/api/file` fetch route (`ctx.connection.fetch.register`) in the forbidden `client-connection` file and reads arbitrary absolute host paths.
- `assistant-stream`: needs a dense `AssistantStreamFrame` with per-attempt revision accounting the freddie loop does not emit.
- `model-selection-projection`: freddie logs no `model/selection` durable event; only `lastUsed` could fold and `pending` would always be null.
- `file-references`: already ported (`packages/context/file-reference`, `fileReferences` namespace, mounted in api-remotes).
- `skill-catalog`, `archived-session-gate`: servable (`ctx.skills`; `ctx.workspaceRegistry.archivedSessionIds`) but not Session commands; left as separate work.
- Cancellation on the command endpoints: the gateway has no cancellation channel, so none is declared.

## Privilege fence

All eight command endpoints mutate live Agent state and must be pinned in `PRIVILEGED_METHODS`: `prompt` starts turns that run tools and bash; `create`/`fork` create Sessions and attach Workspaces; `cancel` aborts turns; `attachment` returns stored image bytes; `selectModel` changes routing and rewrites the saved default model. `stream/next` carries Session transcript and projection content when fed by `session.follow`/`session.control` (same class as `session/page`) and should be pinned wherever it is mounted. `remote-stream` and `session-controller` are mounted by no bundle today.

## Verification (live, real Context, real HTTP socket, harness deleted)

- follow over the wire: `snapshot(cursor=1,records=2) -> event(assistant/message@2)`.
- control over the wire: `baseline({"session-1":{"asOfSeq":2,"values":{"verifyCounter":{"count":1}}}}) -> projection(session-1/verifyCounter={"count":2} seq=3)`.
- `stream/close` while live -> `{closed:true}`, live streams 0; poll after close and unknown id -> `stream/expired`.
- carrier withdrawn -> `remote.$stream` undefined, `follow` -> `{"code":"unsupported",...}`.
- all 15 session endpoints pair host/client on id, arity, cancellation, strict result.
- no gateway: all eight commands -> `session/commands-unavailable`; unknown action kind -> rejected by the strict codec.
- real `ApiProxyService` gateway: `prompt` bad zone -> `invalid-time-zone`, `attachment` -> `ATTACHMENT_NOT_REFERENCED`, `updateQueue` -> `queue-item-not-found`, `cancel` -> `session-not-found`, `fork` -> `fork-unavailable`. Success paths of `create`, `rename`, `prompt`, `selectModel` were not exercised: they need a composed agent loop, persistence, and title service that the harness did not assemble.
