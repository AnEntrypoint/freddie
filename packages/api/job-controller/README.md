# @freddie/freddie-job-controller

Host job Remote owner and its Client jobs service. The Host entry provides `ctx.jobController` and the `job` Remote namespace; `@freddie/freddie-job-controller/client` provides `ctx.jobs`. The roster is a projection of `ctx.jobs`, and the human kill is the only Remote method the namespace carries.

## Host service: `JobController` (ctx key: `jobController`)

`JobController extends TypertRemoteService` with namespace `job`, injects `jobs` and `typert`, and attaches itself to the registry on construction — `JobRegistry.start` refuses work for an owner no attached controller serves, so no producer can start a job the controller could not collect or stop.

`list(agent, signal)` mirrors the jobs one session can see — its own plus every unowned job — as whole-set frames: one on open, then one after each coalesced burst of lifecycle commits, coalesced over `observeFlushMs` (default 100). Reads are projections: the owning agent's consuming read cursor and notice state never observe them, so a human watching a job cannot swallow the notice the owning agent is owed. Output appends never refresh the roster.

`kill(agent, request)` stops one job on a human's behalf. The job must be one the session can see — the registry's owner fence is the only access rule, and a child session's own jobs are killable from its list like any other. The kill records `cancelled by the user`; it is not a kill the model requested, so the owning agent still receives the completion notice and a shell tool waiting on the job reads that reason in its own result. Both registry refusals — an unknown job and one belonging to another session — return one typed `job/not-found` failure, carried by `TypertLookupFailure` so the Gateway adapter preserves its code instead of collapsing it into `internal`.

### Configuration

| Field | Type | Default | Role |
|---|---|---|---|
| `observeFlushMs` | natural, min 1 | `100` | Coalescing window after a lifecycle commit before the next roster read. |

## Client service: `ClientJobs` (ctx key: `jobs`)

`@freddie/freddie-job-controller/client` installs `ctx.jobs` over the `job` namespace. It resolves the Gateway stream factory and the namespace while its own context is current, because stream reopens run on caller stacks whose dynamic context has not declared `remote.job`.

`kill(sessionId, id)` is a pure RPC passthrough returning the Remote result envelope; row state converges through the roster and the caller owns error presentation. `watchRows(sessionId)` is reference-counted, so two watchers of the same session share one stream and the rows leave with the last; a roster stream needs both halves of a streaming Remote, and with either half absent the roster stays absent rather than showing a stale set. The model exposes `getSnapshot()` and `subscribe()` for a UI binding to read an identity-stable snapshot.

## Model Experience

None. The package reads and stops background jobs on a human's behalf and registers no prompt, tool, or session event.

#### KV Cache effect

No direct effect. A human kill changes what the owning agent's next job notice reports, which that agent's own turn observes.

## Known Limitations and Deferred Work

- **`job.follow` is not ported.** dsh streams one job's retained output from an absolute byte offset through `JobRegistry.readAt`, and its README states both reads are non-consuming. freddie's `JobRegistry` has no `readAt`, and its `read` is the *consuming* model-facing cursor: it marks a terminal job reported. Porting `follow` over `read` would let a browser tab swallow the completion notice the owning agent is owed, so the per-job observation stream and the Client observation model stay deferred until the registry grows a non-consuming byte-offset read.
- **`job.list` is not a Remote method.** freddie's `/api` RPC is unary — one POST, one JSON response — so an async generator cannot ride it directly. `@freddie/freddie-remote-stream` supplies the carrier (`session.follow` opens its generator through `ctx.remoteStream.open`), but `JobController` does not inject `remoteStream` and registers only `kill`, so `JobController.list` ships as a host-side generator over the same `streamJobRows` implementation; registering it waits on that wiring.
- **The Client roster is inert until `job.list` is registered.** `watchRows` releases its reference and drops the roster immediately when `$stream` or `job.list` is missing, and `job.list` is missing from both Typert manifests, so a UI reads absence rather than a stale set.
- **No `RemoteError` equivalent.** dsh throws `RemoteError('job/not-found', …)` and augments a `RemoteErrorDetailsMap`. freddie's protocol ships no `RemoteError`, so the typed failure rides `TypertLookupFailure`, the same channel API Remotes already uses for lookup policy rejections; the failure payload is `{ code: 'job/not-found', message, details: { sessionId, jobId } }`.
- **The shipped job UI does not consume this package yet.** `freddie-client-runtime` already folds Host `session/jobs` event frames into `SessionListState.jobsBySession`, and `freddie-client-ui-jobs` renders that mirror read-only. Wiring that header to `ctx.jobs` — and giving it the human-kill control `kill` now makes possible — is follow-up work, not part of the port.
- **dsh's `observeMaxFrameBytes` is omitted.** It budgets output frames for `follow` alone.
- **The session rides the `agent` lookup, not the request body.** dsh passes `request.sessionId` and resolves it inside the controller. freddie resolves the Agent through the Typert `agent` lookup, which also cold-resumes a dormant session and yields a typed `session-not-found` failure, so the wire carries `agentId` and `kill`'s body carries only `jobId`.
