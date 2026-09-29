# @freddie/freddie-terminal-controller

Session-owned interactive user terminals over freddie's PTY registry: shell discovery,
bounded screen recovery, attachment-scoped input, and typed Remote control.

Ported from `deepseek-harness`'s `terminal` package onto freddie's seams. Buildless ESM
plain JavaScript with JSDoc types; no build step and no runtime dependency beyond what
freddie already ships (notably: **no `@xterm/*`** — freddie has none).

**Browser consumer: none, and none can be built on these endpoints yet.** No UI package calls the `terminal` namespace or `ctx.webTerminals`, the package declares no `freddie.client` entry, and no endpoint returns terminal output because `retain` and `follow` have no transport (see Known limitations). See `AGENTS.md` for what an interactive browser terminal would need.

## Host

```js
import { TerminalController } from '@freddie/freddie-terminal-controller'

export const name = 'terminal-controller'
export const inject = ['terminals', 'subprocess', 'sandboxPolicy', 'typert']
export function apply(ctx) {
  ctx.plugin(TerminalController, TerminalController.Config({}))
}
```

The service registers itself as `ctx.terminalController` in the `terminal` Remote
namespace. `static inject` declares what the Gateway must resolve before it loads.

| Config | Default | Meaning |
| --- | --- | --- |
| `shell` | platform default | explicit `{ path, name, args }` profile overriding discovery |
| `shellCandidates` | `zsh, bash, fish, pwsh, powershell, cmd` | executable names offered in the launch menu |
| `ptyType` | `shell` | backend type passed to `ctx.terminals.spawn` |
| `maxTerminals` | `8` | concurrent retained terminals per Session |
| `maxCols` / `maxRows` | `500` / `200` | accepted dimension bounds |
| `scrollback` | `1000` | rows in one bounded recovery page |
| `maxBufferedBytes` | `2 MiB` | per-attachment output queue cap |
| `maxInputBytes` | `64 KiB` | single `write` payload cap |
| `cleanupRetryMs` | `60000` | delay before retrying a failed background cleanup |

Terminal identities and attachment identities match `^[\w-]{1,128}$`.

### Remote surface

Seven endpoints, all genuinely callable over freddie's unary `/api` RPC. Every
Agent-scoped endpoint receives the Session through a `source: 'lookup'` parameter, and
`environment`, `shells`, and `create` also take an optional trailing `AbortSignal`; `list` takes the Session id directly so an offline or
historical Session can be listed without activating its Agent.

| Method | Shape | Returns |
| --- | --- | --- |
| `environment` | `(agent, signal?)` | `TerminalEnvironment` — cwd and limits |
| `shells` | `(agent, signal?)` | `TerminalShell[]` — verified profiles, default first |
| `list` | `(sessionId)` | `WebTerminalInfo[]` — retained terminals for this Host lifetime |
| `create` | `(agent, request, signal?)` | `WebTerminalInfo` — idempotent per open identity |
| `write` | `(agent, id, attachmentId, data)` | `void` |
| `resize` | `(agent, id, attachmentId, cols, rows)` | `void` |
| `close` | `(agent, id)` | `void` — closes the identity to future creation |

Failures are `TypertLookupFailure`s with `terminal/unavailable`,
`terminal/control-unavailable` (a stale or read-only attachment), or
`terminal/limit-reached`; the Gateway preserves them verbatim as
`{ ok: false, error: { code, message, details } }`.

Registration is buildless, matching `packages/gm/gm-client/src/index.js`:

```js
Remote('shells')(TerminalController.prototype.shells, {
  name: 'shells',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(TerminalController.prototype)) },
})
```

## Client

The web bundle does not mount this entry. It is a library export for a Client assembly that also supplies the missing output stream and a screen renderer.

```js
import * as terminalController from '@freddie/freddie-terminal-controller/client'

export const inject = terminalController.inject // ['remote', 'remote.terminal']
export function apply(ctx) { terminalController.apply(ctx) }
```

`ctx.webTerminals` then offers `view(sessionId, key, contentId, terminalId?, shellPath?)`,
`launchShells`, `selectShell`, `close`, `recover`, `retryClose`, and `closeFailures`. A
view owns its own subscriber set (`createViewStore`) and never throws at the UI: transport
and Host failures become `phase`/`issue` state.

## Adaptations from dsh to freddie

1. **Screen model.** dsh rendered a `@xterm/headless` grid from raw PTY bytes. Freddie's
   PTY registry already retains output, so `BrowserTerminal.screen()` is a bounded
   `ctx.terminals.read(owner, ptyId, { offset: 0, count: scrollback })` page. Recovery is
   text, not a re-rendered grid, and no emulator dependency is introduced.
2. **Live output.** dsh pushed PTY data events directly. Here
   `ctx.terminals.subscribe(owner, listener)` delivers `output`, `resized`, `exited`, and
   `closed` activities; `BrowserTerminal.observe` turns them into Host-sequenced `output`
   frames and `state` frames, and exit settles every follower.
3. **Spawn and sizing.** `ctx.terminals.spawn(agent, { type: ptyType, name: request.id, cwd },
   signal)` fixes the PTY name at spawn, then `ctx.terminals.resize(...)` returns the
   dimensions actually applied, which become `info.cols`/`info.rows`.
4. **Backend-owned argv.** freddie's PTY backend (`terminal-bash`) builds the child argv
   from its own `shellPath`/`shellArgs`/dialect plus the sandbox policy. The controller's
   resolved `shell` is therefore the *reported profile and title*, and `request.shellPath`
   is validated against discovered shells; it does not and cannot change the spawned
   executable. On a Host whose backend runs `powershell.EXE` while discovery reports
   `cmd.exe` as the platform default, the created terminal reports `cmd.exe` metadata.
5. **Working directory.** `agent.session.header.cwd ??
   ctx.sandboxPolicy.resolve({ session }).workspaceRoot`, replacing dsh's own workspace
   resolution.
6. **Shell discovery.** Candidates are verified with `ctx.subprocess.resolveExecutable`.
   A candidate that fails to resolve is omitted from the menu rather than failing it,
   because the provider reports a lookup miss as a plain `Error` with no typed class.
7. **No `RemoteError`.** Host failures use freddie's `TypertLookupFailure`; the Client
   model uses a local `TerminalViewError` carrying the same `code`/`details` wire shape.
   Nothing was added to `@freddie/freddie-typert-protocol`.
8. **No client store.** dsh's `createSnapshotStore`/`notifySubscribers` are replaced by an
   inline `createViewStore` (listener `Set`, per-listener `try/catch`) in `client/model.js`.
9. **Bindings are in memory.** dsh's `bindings.ts` becomes a `Map` on `ClientTerminals`
   keyed `${sessionId} ${contentId}`; only close intents are durable, through
   `TerminalCloseRequests` in `localStorage`.
10. **Client manifests declare no `scope`.** A scoped descriptor resolves its Agent from
    the *calling* Client Context, which would make one call site mean two different things
    depending on where the view was created. Every endpoint takes the Session id as an
    ordinary argument and the Host resolves the Agent by lookup. The Host manifest keeps
    `scope` on the Agent-lookup endpoints; host dispatch never reads it.
11. **Retention policy only.** dsh's unattended reclamation read `handle.inspectActivity()`
    / `shellActivity`; freddie's subprocess seam exposes no activity inspection, so
    `TerminalRetention` keeps the connection-hold and retryable-cleanup policy driven by
    `cleanupRetryMs`. `unattendedTimeoutMs` and `activityPollIntervalMs` are not ported.
12. **`disposeGraceMs`** is backend config (`terminal-bash`), not a controller option.
13. **`list` is controller state.** It reads the controller's own owner map, not the PTY
    registry, because registry sessions are bound to owner liveness and disappear with it.

## Known limitations and deferred work

- **`retain` and `follow` have no transport.** In dsh both are `@Remote({ mode: 'stream' })`
  driven through `ctx.remote.$stream(...)`. Freddie's Gateway exposes only unary `/api`
  RPC, so both are ported faithfully as Host async generators but are **not** registered as
  Remote endpoints and **not** present in either Typert manifest. The Client resolves a
  stream factory defensively — it uses `ctx.remote.$stream` plus `remote.follow` only when
  both exist, and otherwise patches the view with `issue: 'unsupported'` and an explanatory
  message, never throwing and never fabricating frames. `@freddie/freddie-remote-stream` now
  supplies a stream carrier, but `TerminalController` does not inject `remoteStream` and has not
  been moved onto it, so live output still has no transport; the `openStream` body is already
  written against `ctx.remote.$stream`. For a UI this means a client can create, type into,
  resize and close a shell but can never read its screen: the seven endpoints carry no output,
  so no interactive terminal can be built until `follow` rides a stream carrier.
- **`rename` is omitted.** `ctx.terminals` sets a PTY name only at spawn and offers no
  rename, so the endpoint would have to lie. dsh's rename is not ported.
- **Unattended reclamation by inactivity** is not implemented (adaptation 11). Terminals
  live until an explicit close or owner disposal.
- **Screen recovery is text.** Clients render rows themselves; there is no cursor or ANSI
  grid model on the Host.
- **Reported shell metadata may differ from the spawned executable** (adaptation 4).
- **Host restarts lose terminals.** `list` reflects in-memory Host state for the current
  process lifetime only.
- **Client persistence is per-browser and per-page.** Close intents survive reload through
  `localStorage`; content-to-terminal bindings do not.
