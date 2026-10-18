# freddie-experimental-browser-use-chrome-devtools-mcp

Use Chrome DevTools MCP to inspect pages and operate Chromium through its upstream tools. The provider starts a Session's MCP connection inside `agent/created` and holds that Agent until discovery settles, so its first turn already carries the complete tool catalog; the connection is retained across later turns. Launch a separate browser, or attach one Session to an existing browser with its current tabs and login state.

The `@freddie/freddie-bundle-base` profile resolves this provider but keeps its row disabled. Enable exactly one browser-use provider in an operator-controlled profile; this provider can still exclude selected presets after it is enabled.

## Use this package

Mount it next to the browser-use service, in a composition that supplies Agents, tools, and system prompts. Loading or reloading this provider does not adopt Sessions that are already active. Browser installation follows the upstream runtime; select an existing Chromium installation with `executablePath`.

```yaml
- name: '@freddie/freddie-browser-use'
- name: '@freddie/freddie-experimental-browser-use-chrome-devtools-mcp'
  config:
    mode: launch
    headless: true
    excludePresets: [minimal]
```

Use `mode: attach` and set `endpoint` to an HTTP(S) debugging URL or WS(S) browser endpoint to operate an existing browser. The new live Session claims the attachment during initialization and retains it until unloading. If the attachment is busy, that activation continues without this browser and does not retry on later turns. After release, a newly created or resumed activation can acquire it. Direct calls from another Session fail. Cleanup disconnects and leaves the external browser and its pages running.

| Field | Default | Meaning |
|---|---|---|
| `mode` | required | `launch` or `attach`, fixed for this provider activation |
| `headless` | `true` | Launch without a visible window |
| `executablePath` | upstream discovery | Chromium executable for launch |
| `endpoint` | required for attach | Existing browser debugging endpoint |
| `toolCallTimeoutMs` | MCP client default | Per-call timeout in milliseconds |
| `entryPath` | module resolution | Explicit path to the pinned `chrome-devtools-mcp` CLI entry |
| `excludePresets` | `[]` | Agent preset ids whose agents get no MCP server and no browser tools |

### Server entry resolution

This package declares `chrome-devtools-mcp` as an **exact-pinned `optionalDependency`** (`1.9.0`), installed with `pnpm install --ignore-scripts` so its own lifecycle scripts never run: the provider resolves the installed npm entry (`build/src/bin/chrome-devtools-mcp.js`) at launch and starts it under the current Node executable. Set `entryPath` when that entry is installed outside this package's Node resolution. When the entry cannot be resolved through module resolution and no `entryPath` was given, the provider logs exactly one warning naming the pinned version and stays inert — no tools, no listeners, no throw. An explicit `entryPath` that does not exist, or a malformed config, still throws at plugin load.

The child inherits only the MCP client's [scrubbed ambient environment](../../subprocess/subprocess/README.md): credential-shaped names (`/KEY|PASSWORD|SECRET|TOKEN/i`) and every `FREDDIE_*` name are stripped before spawn, plus `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1` this provider adds to close the server's own npm-registry update check. Usage statistics, CrUX lookups, and source-map fetches are disabled with `--no-usage-statistics --no-performance-crux --no-source-maps`. In `launch` mode the provider also passes a `--chrome-arg=--host-resolver-rules=...` that resolves Chrome's own upkeep hosts (component updater, GCM, Safe Browsing, autofill, CSP reporting) to nothing — see this package's `AGENTS.md` for the exact list and what remains unclosable (the OS-level Chrome updater is outside this package's process tree entirely).

## Understand the implementation

The provider builds the launch or attachment arguments and hands them to the [shared runtime](../browser-use-runtime/README.md), which owns awaited Agent initialization, per-Session serialization, and cleanup; the [MCP client](../../mcp/mcp-client/README.md) owns transport, discovery, and result projection. No runtime invariant companion is published beyond the explained empty one, because the provider maintains no independent connection observation.

Browser state survives turns while its live Session remains attached. Disposal waits for server shutdown before releasing resources. Resume after reload starts fresh browser runtime state; stored conversation history does not restore cookies or pages.

## Model Experience

### Browser tools and screenshots

#### What the model sees

Tools retain upstream descriptions and JSON schemas under `mcp__chrome-devtools-mcp__<tool>` names. Text and screenshots use the normal tool-result pipeline and Session log. Screenshots require an attachment store and an image-capable model route; other routes receive the MCP image diagnostic. The MCP client also exposes resource helpers and attributed server instructions, shown only after this Session owns a connection; targeted resource requests enforce the same ownership.

#### Token effect

The catalog, resource helpers, and server instructions add tool definitions and prompt text. Calls add arguments, text, and admitted images to Session history. Inline image bytes stay outside model-visible history.

#### KV Cache effect

An unchanged catalog preserves its tool-definition prefix. Results append to history; provider or catalog changes can reduce prefix reuse.

## Known Limitations and Deferred Work

The integration retains the pinned server's browser and tool restrictions.

- **Optional dependency** — the pinned server installs via `optionalDependencies` (`--ignore-scripts` always); a deployment that never installs it (or a platform pnpm skips it on) mounts inert instead of failing.
- Chromium only; Firefox and WebKit are not selectable.
- Startup failure leaves that activation without browser tools and triggers client cleanup. A disconnected client is not retried; after fixing the cause, create a new Session or unload and resume the existing one.
- Attachment exclusivity is local to this provider instance. Other processes and browser users can still modify the same pages.
- Cancellation does not undo navigation, clicks, or other actions already delivered to the browser.
- Tool schemas follow the pinned experimental server and carry no freddie stability promise.
