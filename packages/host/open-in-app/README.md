# @freddie/freddie-host-open-in-app

Host half of open-in-app: three routes on `ctx.webServer` that resolve a fixed catalog of installed editors and IDEs, Git GUIs, terminals, and file managers to **verified launchers** on macOS, Windows, and Linux, and serve the catalog, each application's real icon, and a launch endpoint. Every route is pinned to loopback by an empty trust list, so the offer and the launch are only reachable from the machine running the host.

The catalog resolves lazily, **once per host process**, on the first request that needs it, into one map of verified launchers: the apps route serves its keys and the open route launches its values, so a click never re-runs detection. A launch whose executable is gone re-resolves that ONE entry and drops it when nothing proves it anymore — the uninstall direction self-heals immediately, while a newly installed application waits for the next process. Resolution is a proof obligation at every step: an install record counts only when it names an executable on disk, a bundle only when the directory exists, a `cli` name only when PATH/PATHEXT resolves it in-process.

## When to choose it

Choose it for a Web deployment whose users work beside a local editor, Git GUI, terminal, or file manager and want the workspace directory opened there in one click. Avoid it for opening one path with the OS-default application from host code — that is `host.openPath` on [`freddie-host-apiproxy`](../apiproxy/README.md); this package's subject is *which* application, with per-application resolution and launchers.

## Mount it

Mount it in a composition that carries `webServer`; it registers three routes and nothing else, provides no service, and reads no harness state.

```yaml
- name: '@freddie/freddie-host-open-in-app'
  config:
    probeTimeoutMs: 10000
    iconTimeoutMs: 10000
    launchWatchMs: 1000
```

| Field | Default | Meaning |
|---|---|---|
| `probeTimeoutMs` | `10000` | Deadline per catalog-resolution host command (`xcode-select`, each `reg.exe` read). |
| `iconTimeoutMs` | `10000` | Deadline per icon-extraction host command (`plutil`/`sips` on macOS, the PowerShell extraction on Windows). |
| `launchWatchMs` | `1000` | Early-failure watch window per launch: a launcher still running when the window closes counts as launched and keeps running, so this bounds how long a successful launch is held, not how long the application may live. |

The three deadlines are independent, so tuning detection never changes how long a launch is watched. They are failure bounds, not latency budgets: conservative probe and icon values cost nothing while the commands are healthy.

## Routes

| Method | Path | Response |
|---|---|---|
| `GET` | `/open-in-app/apps` | `200 {"apps":[...]}` — the resolved catalog ids in menu order. |
| `GET` | `/open-in-app/icon/<id>` | `200` the extracted PNG or SVG (`cache-control: public, max-age=3600`), or `404 {"code":"not-found",...}`. |
| `POST` | `/open-in-app/open` | `200 {"ok":true}`, or `400`/`404`/`413`/`415`/`502` with `{"code","message"}`. |

All three answer `403 forbidden` to a request whose `Host` is not loopback, that carries a `Sec-Fetch-Site: cross-site` marker, or whose `Origin` is not its own `Host`, and `405` with an `Allow` header to a wrong method. The route paths and payload shapes are published as the browser-safe `./shared` subpath (constants and JSDoc types only).

`POST /open-in-app/open` validates its body at the wire before doing anything: an `application/json` media type, a 64 KiB ceiling, string `app`/`path` fields, a catalog id that resolved and is still available, and an absolute path naming an existing directory. It then launches the map's already-verified launcher — never a re-detection — so a request cannot steer the host at an application it never proved it holds.

## The catalog and how it resolves

The catalog is a fixed whitelist: editors and IDEs (Cursor, VS Code and Insiders, Windsurf, Zed, Sublime Text, Xcode, Android Studio, and the JetBrains IDEs IntelliJ IDEA, PyCharm, WebStorm, PhpStorm, GoLand, Rider, RustRover), Git GUIs (Fork, Sourcetree, GitHub Desktop, Tower, GitKraken, SmartGit, Sublime Merge), terminals (Ghostty, Warp, iTerm2, kitty, Terminal, Windows Terminal, Git Bash, GNOME Terminal, Konsole), and per-platform file managers (Finder, File Explorer, `xdg-open`).

- **macOS** checks the known application directories (`/Applications`, `~/Applications`) for the entry's bundle spellings and launches `open -a <resolved bundle>`; Xcode follows `xcode-select -p`, so Beta or renamed installs are found, and launches through `xed` with `open -a <bundle>` only as the fallback. No Launch Services query and no disk scan runs.
- **Windows** reads the `App Paths` registry keys, then the Uninstall records (kept only when they prove an executable on disk), then well-known install paths and the newest versioned install directory. GitHub Desktop resolves its versioned executable together with the packaged `cli.js` and invokes `github open <path>` without a command shell. Registry reads are batched: one `reg.exe query` per root per resolution pass.
- **Linux and Windows CLI names** resolve in-process against this host's `PATH`/`PATHEXT` — deliberately not through the `ctx.subprocess` seam, which resolves inside a provider's execution world and would search a remote sandbox instead of the operator's desktop. Zed, Ghostty, kitty, GNOME Terminal, and Konsole fall back, when their CLI is off PATH, to their XDG desktop entry's verified `TryExec`/`Exec` (VS Code, VS Code Insiders, Sublime Text, and Sublime Merge read their desktop entry for the icon only), and the `xdg-open` entry appears only when the host announces a display server.

Application launches spawn detached on `scrubbedParentEnv()`, so an editor never inherits a provider key; the file managers' `shell-open` launches instead run the OS open verb (`open`, PowerShell `Invoke-Item`, `xdg-open`) through `freddie-native-command` on the inherited environment, watched by the same `launchWatchMs` window. Windows GUI processes stay visible unless the entry is a CLI adapter that opens the window itself.

## SSH launches

When the inherited process environment carries a non-empty `SSH_CONNECTION` or `SSH_TTY`, no probing runs and the application list is empty, so icon and launch requests are refused as unavailable. The markers come from the process environment only — layered configuration cannot talk itself out of the guard — and an SSH session that forwards a display is still refused, because opening an editor there would target the host rather than the machine the browser is on.

## Model Experience

None, as the package opens host applications for a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends a provider request.

## Known Limitations and Deferred Work

- **The catalog is fixed at build time.** A deployment cannot add its own editor or Git GUI from cordis.yml; extending the list means extending `OPEN_IN_APP_CATALOG` and the future browser surface's dictionaries together. The operating system can locate known applications but cannot establish that every installed application accepts a workspace directory or which launch protocol it requires, so the package does not enumerate an unrestricted OS application list.
- **macOS detection is known-paths only.** A bundle renamed beyond the catalog's spellings or moved outside `/Applications` and `~/Applications` is not detected; there is no Launch Services query (a native lookup needs an addon the repository does not carry) and deliberately no disk scan.
- **Icon fidelity is platform-bound.** Windows icons come from `ExtractAssociatedIcon` at 32px — the most the stock .NET surface yields without a native addon — which can render slightly soft on high-DPI displays; Linux icons follow the hicolor theme and pixmaps only, not the user's active icon theme; entries with no icon source (CLI-only launchers without a desktop entry) keep the generic glyph.
- **New installs appear after a restart.** Resolution runs once per host process; only the uninstall direction self-heals.
- **No browser surface ships.** `./shared` carries the route paths and payload shapes for one, but no freddie package reads it yet, and the document-relative route forms upstream pairs with each path are therefore absent rather than unused.
- **WSL is not covered by the Linux file-manager entry.** The desktop gate reads `DISPLAY`/`WAYLAND_DISPLAY`, which WSL does not set, so `xdg-open` is not offered there; a WSL launcher would have to translate the path with `wslpath -w` and drive the Windows shell instead, and is deferred until a WSL host can verify it.

## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

**The trust fence is tighter here than upstream, and that is the main adaptation.** dsh asks the composition's `connection` service for a rejection, stacking a DNS-rebinding and origin fence on the deployment's browser authentication. freddie's connection README states that its fence "is a reachability policy, not authentication" and that the Web carrier "provides no authentication layer", so there is no browser authentication to lean on. Each route therefore calls `isTrustedApiRequest(req, [])` with an EMPTY trust list, pinning it to loopback — the same pin `client-connection` applies to its `PRIVILEGED_METHODS`, `host.openPath` among them. Opening the workspace in a chosen application is that sibling host action's equal, so it takes the equal pin; the config deliberately carries no `trustedHosts` field that could widen it. Consequence: on a `0.0.0.0` deployment these routes are unreachable from the LAN, which is the intent.

**Dependency choices, all workspace-internal — no new npm dependency.** `@freddie/freddie-native-command` runs every resolution and icon command (argv, never a shell). `@freddie/freddie-client-connection/src/api-request-trust.js` is imported directly for the one pure request predicate rather than injecting the whole connection service, which also keeps `inject` down to `['webServer']`. `@freddie/freddie-subprocess` supplies `scrubbedParentEnv()` only: duplicating its `/KEY|PASSWORD|SECRET|TOKEN/i` and `FREDDIE_*` scrub locally would create a second definition of credential policy, which is worse than a dependency on the package that owns it.

**PATH resolution is local, not the subprocess seam.** Upstream calls `ctx.subprocess.resolveExecutable()`; freddie's seam resolves inside a provider's execution world, which for a remote provider is the sandbox. A desktop launcher is a fact about the machine the operator sits at, so `resolver.js` stats `PATH`/`PATHEXT` itself. The Linux desktop-entry and icon lookups are likewise implemented here: upstream's `dsh-native-command` exports `desktopEntryFields`/`desktopDataDirectories`/`desktopApplicationIcon`, and freddie's does not.

**The injectable internals seam upstream carries is gone.** dsh's `OpenInAppInternals` exists for deterministic tests; freddie ships no test files, and an injectable platform/run/launch seam with no production caller is exactly the unsupported public surface `packages/AGENTS.md` warns about. Resolution reads `process.platform` and the real environment directly, which also means the SSH guard reads the inherited process layer as specified rather than a supplied fact.

**Route paths keep upstream's `/open-in-app/*` spelling** (there is no freddie app-route convention to fold into) and registration follows `ctx.effect(() => ctx.webServer.register(route), label)`, the webserver's own idiom.

</details>

**Runtime invariant:** The `./invariant` companion (`host-open-in-app-invariant`) reserves package ownership and installs no check. The package serves one host resolution pass over three stateless routes; the route registrations prove disposal through their cordis effects, and no independent observations can diverge.
