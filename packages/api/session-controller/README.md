# @freddie/freddie-session-controller

Host Session Remote owner and its Client Session model. The Host entry provides `ctx.sessionController` and the `session` Remote namespace; `@freddie/freddie-session-controller/client` provides `ctx.sessionModel`.

**Browser consumer: none, by design.** The shipped web page drives sessions through the legacy `/api/session.*` routes and the `events.mux` channel (`packages/client/runtime`), which already serve every browser need: list, history, prompt, cancel, and live events. This package's Typert route is for out-of-process Clients (an SDK, a second frontend, a CLI). It declares no `freddie.client` entry, and no UI package reads `ctx.sessionModel`, `follow`, or `control`. See `AGENTS.md`.

The port covers the Session *reads* dsh's `session` package exposes to a UI — list, search, paged history, projections, and the model catalog — plus the Agent/Session identity policy that decides which Session an ordinary (non-subagent) address may activate. The Session *command* surface is served by delegation to the host API gateway, and `follow`/`control` cross the wire through the frame-stream carrier (see below).

## Host service: `SessionController` (ctx key: `sessionController`)

`SessionController extends TypertRemoteService` with namespace `session`, injecting `agentDefaultModel`, `agents`, `llm`, `remoteStream`, `sessionProjections`, `sessionQuery`, and `sessions`. Every method is cold-safe: a persisted Session is read without resuming its Agent.

### Remote methods (unary `/api`)

| Method | Request | Result |
|---|---|---|
| `list` | — (`signal`) | `{ items: SessionSummary[] }`, newest activity first; every field the legacy `session.list` row carries (below) |
| `search` | `{ query }` (`signal`) | `{ items: { sessionId, snippet }[], hasMore }`, bounded at 20 hits |
| `modelCatalog` | — | `{ default, routableProviders, groups, failures }` |
| `page` | `{ address, throughSeq, beforeSeq?, maxMessages?, turnWindow? }` (`signal`) | `{ records: { type: 'event', event }[], hasMore }` |
| `projections` | `{ sessionId }` (`signal`) | `SessionProjectionBaseline \| null` |

A `SessionSummary` row carries `sessionId`, `updatedAt`, `agentAvailable`, `running`, `blank`, and optionally `errored`, `parentSessionId`, `origin`, `cwd`, `agentPreset`, `readOnly`, `extraHome`, and `projections`, so a strict parse of a legacy `session.list` row with the shipped schema (`src/list-codecs.js`, shared by both manifests) succeeds and drops nothing. `errored` is true when the latest closed turn failed and none runs now. `agentPreset` is the preset the Session runs: an attached row resolves it from its event log (the newest logged selection wins), a cold or foreign row from its creation header. `readOnly: true` with `extraHome` marks a row listed from an extra session root (`FREDDIE_EXTRA_SESSION_ROOTS`) that this Host reads but does not own; such a row never shadows an id already listed.

`page` reads a message-aligned slice of one durable address: `throughSeq` is the inclusive log cut, `beforeSeq` an exclusive upper bound, and `turnWindow` extends a page backwards across whole turns so a UI never opens on a half-turn. `projections` answers `null` — not a failure — for a Session that does not exist, so a client can drop a dead row instead of surfacing an error.

A `SessionAddress` is either `{ kind: 'session', sessionId }` or `{ kind: 'subagent', parentSessionId, childSessionId, mode }`. A `session` address naming a subagent Session is rejected with `session/agent-busy`; a `subagent` address whose parent, mode, or descriptor does not match is rejected with `subagent/unauthorized` or `subagent/catalog-diagnostic`.

### Stream endpoints (`follow`, `control`)

`follow(request, signal)` and `control(signal)` are Remote methods that return `{ streamId }`: they register their generator with `ctx.remoteStream` (`@freddie/freddie-remote-stream`) and the Client polls `stream/next` for frames. Frames are validated against `sessionFollowFrameSchema` / `sessionControlFrameSchema` (`src/frames.js`) before they are buffered. The opening frame is produced before the id is handed out, so an unknown Session fails the opening call.

- `follow` yields one `snapshot` frame (wire header, cursor, opening page, projection baseline) and then every durable event appended after that cursor, gap-checked by seq. When the opening read came from persistence rather than the attached store, it promotes the Session's Agent in the background, so the next read is live.
- `control` yields one `baseline` frame — the projection cut of every attached Session — followed by a `projection` frame per unit change, driven by `ctx.sessionProjections.onChanged`.

Both unwind on the caller's signal, on `stream/close`, on idle expiry, and on the controller's own fiber.

### Command endpoints

`create`, `rename`, `fork`, `prompt`, `attachment`, `updateQueue`, `cancel`, and `selectModel` are Remote methods whose strict codecs live in `src/command-codecs.js` and are shared by the Host and Client manifests. freddie already implements every one of them once, in the host API gateway (`ctx.apiProxy.sessions`, `packages/host/apiproxy`), which owns the Agent activation policy, preset-conflict rules, Workspace attach, and attachment authorization. `src/commands.js` delegates to that gateway through `ctx.get('apiProxy')` — no package dependency, so no composition cycle (apiproxy depends on `api-remotes`, which depends on this package) — and re-raises its `{ ok: false, error }` outcomes as `TypertLookupFailure` with the gateway's own `code`, `message`, and `details` (for example `session-cancel-requires-confirm`, `queue-item-not-found`, `attachment-error`). A deployment that composes no gateway answers `session/commands-unavailable`. None of these declares cancellation: the gateway has no cancellation channel.

Every command mutates live Agent state and must be treated as privileged: `prompt` starts turns that run tools, `create`/`fork` create Sessions and attach Workspaces, `cancel` aborts turns, `attachment` returns stored image bytes, `selectModel` changes routing and rewrites the saved default model.

### Other Host surface

`inspect(sessionId, signal)` reads one Session's header, inherited event count, and event prefix without activating anything. `resolveAgent(sessionId)` resolves or resumes an ordinary Session's Agent and returns either `{ agent }` or a stable `{ error }` — `session/not-found`, `session/agent-busy` for an identity owned by subagent routing, or `internal`. `promote(sessionId)` is `resolveAgent` fire-and-forget with failures published as `api-session/error`, used after a cold read. Both failure codes ride `TypertLookupFailure`, which the Gateway adapter preserves instead of collapsing into `internal`.

### Events

`api-session/added`, `api-session/removed`, `api-session/status`, `api-session/activity`, and `api-session/error` are emitted on `ctx` (`SESSION_CONTROLLER_REMOTE_EVENTS`). `api-session/status` carries `(sessionId, running, errored)`; the third argument keeps the roster's `errored` current when a turn ends. Reaching a Client requires each name in the application's forwarded Host-event allowlist (`packages/api/remotes/src/remote-events.js`).

### Configuration

None. dsh's only field, `nativeOpen`, selects native-desktop path behaviour that this port does not carry, so no `Config` was invented for it.

## Client service: `ClientSessionModel` (ctx key: `sessionModel`)

`@freddie/freddie-session-controller/client` mounts the `session` namespace itself through `ctx.remote.$mount(TYPERT_REMOTE)` — add the plugin to a Client assembly **once**, and do not also list `@freddie/freddie-session-controller/remote` in a Remote assembly, which would mount the same namespace twice. It then subscribes to the five `api-session/*` events and mirrors them into a roster: `upsert`, `remove`, `setRunning`, `setActivity`, and `setError`. The model exposes `roster()`, `failureFor(sessionId)`, `subscribe(listener)`, and outcome-shaped reads and commands (`refresh`, `search`, `modelCatalog`, `page`, `projections`, `create`, `rename`, `fork`, `prompt`, `attachment`, `updateQueue`, `cancel`, `selectModel`) that never throw — a carrier or namespace failure becomes `{ ok: false, error: { code, message } }`.

`follow` and `control` resolve both halves of a streaming Remote defensively: the model reads `remote.$stream` lazily, so with no factory installed — or after the carrier is withdrawn — or no endpoint behind it, they answer `{ ok: false, error: { code: 'unsupported', … } }` rather than faking frames.

## Model Experience

None. The package reads Sessions for a UI and registers no prompt, tool, or session event.

### KV Cache effect

No direct effect. `prompt` starts a turn and `resolveAgent`'s resume activates a dormant Agent, so either can append the turn that Session's Agent produces next.

## Known Limitations and Deferred Work

- **Companions not ported.** `file-references.js` is already ported (`packages/context/file-reference`, `fileReferences` namespace). `media-references.js` needs `ctx.connection.fetch.register('/api/file')` and reads arbitrary absolute host paths, which the privilege fence must not gain. `assistant-stream.js` needs a dense `AssistantStreamFrame` with per-attempt revision accounting freddie's loop does not emit. `model-selection-projection.js` would fold only `lastUsed`: freddie logs no `model/selection` durable event, so `pending` would always be null. `skill-catalog.js` and `archived-session-gate.js` are servable (`ctx.skills`, `ctx.workspaceRegistry.archivedSessionIds`) but are separate features, not Session commands.
- **`search` needs a composed query backend.** `@freddie/freddie-session-query-sqlite` is the backend; where the engine stays abstract or search is disabled, `search` answers `session/search-unavailable` instead of an internal failure.
- **`remote-stream` is composed only by the web bundle.** `packages/bundle/web-app/cordis.patch.yml` mounts both `session-controller` and `@freddie/freddie-remote-stream`, and `SessionController.inject` lists `remoteStream`, so any other deployment must add the carrier (and the gateway, for commands, and the client plugins) explicitly before the controller loads. The `./client` entry of this package declares no `freddie.client` face by design (see the browser-consumer note above), so the web page does not mount it and no UI reads `ctx.sessionModel`.
- **`initializeDefaultModel` is not ported.** It is DeepSeek-vendor account behaviour with no freddie equivalent.
- **The native-desktop path endpoints are not ported.** dsh opens and reveals Session paths through host APIs freddie does not expose here; `nativeOpen` and the `Config` it belonged to are omitted rather than stubbed.
- **No `RemoteError` equivalent.** dsh throws `RemoteError` and augments a `RemoteErrorDetailsMap`. freddie's protocol ships no `RemoteError`, so typed failures ride `TypertLookupFailure` with `{ code, message, details }` — the channel API Remotes already use for lookup policy rejections, and one the Gateway preserves.
- **Projection ownership stays with the gateway.** dsh's list registers `sessionListMetadata` and `imageLimits`. freddie's `packages/host/apiproxy` already registers both (`sessionListMetadata` at `stateVersion` 2, with `errored`), and `sessionProjections.register` refuses a duplicate key at a different version, so the ported list *reads* those values instead of registering them. A deployment without the apiproxy serves rows with no projection block rather than failing.
- **`sessionListMetadata` gains `errored`.** freddie's unit carries a third field, so the wire type does too; `blank` and `lastPromptAt` mean what dsh's do.
- **No Typert lookup or Context configuration.** `ctx.typert.lookups.configure('agent' | 'session')` and `contexts.configureHost('agent')` are already installed by `packages/api/remotes`, and `configure` throws on duplicates, so `agent.js` registers neither.
- **`observeSession` has no freddie equivalent.** dsh's single live/cold observation seam is replaced by `sourceFor`, which reads the attached store first and falls back to `ctx.sessionQuery.readSession`, restoring projections over the persisted log the way the apiproxy's detached read does. `sessionProjections.cachedSnapshot` is likewise replaced by `snapshot` (live) and `restore` (cold) for `follow`, `control`, `page`, and `projections`; a cold `list` row instead reads `ctx.get('sessionProjectionCache')?.cachedSnapshot(header)` when that service is composed. `cachedPredecessorTitle` has no counterpart and is omitted.
- **Seed lineage is read from the header.** dsh's `session.inheritedEventCount` and `snapshotEvents(n)` become `header.seedLength ?? 0` and `events.slice(n)`.
- **`list` takes no request.** dsh's list request carried fields with no freddie reader, so the method is cancellation-only and the manifest declares no parameters.
- **The upstream Client half was not in the download.** dsh's `session/src/client/contract/*` and `session/src/client/sessions/*` came back as `404: Not Found`, so the Client model is built from freddie's own Client Remote conventions (`packages/api/remotes`, `packages/api/job-controller`) rather than ported.
