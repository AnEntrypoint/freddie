# Agent Note: Never-restart HMR across host, shell, and client

Status: implemented

## Problem

A source edit on the live GUI used to require killing the web process or a full page refresh. Host HMR called `loader.exit()` when a file sat in the CLI entry's dependency tree (`externals`). The browser half answered `shell-rebuilt` (and failed plugin swaps) with `window.location.reload()`. gm tools dispatched against `process.cwd()` (the GUI checkout) instead of the session workspace, so the model could not talk to the open project's spool. Those three failures are one operator-visible contract: an edit must apply in the already-running process and the already-open tab.

## Decision

Host, shell, and client each hot-reload in place. The process pid and `window` identity stay put.

**Host plugins.** `framework/hmr` stashes an external or loadCache hit and runs `partialReload()`. It never calls `loader.exit()`. `snapshot()` returns a bounded leaf-only journal (`deferred`, `stashed`, recent events). Agent-loop still defers a pass while `busyAgents` is non-empty via `hmr/before-reload`. Profile boot watches `framework/*/src` alongside `packages/` and `apps/`. Composition edits still ride `watchUserPatches` / Include refresh by row id.

**Shell.** The node half of `client-hmr` polls `apps/web` and `packages/client/web/src`. A change broadcasts `shell-rebuilt` with a rev token. The browser half installs `<base href="/__hmr/<rev>/">`, re-imports live workspace packages (`@freddie/freddie-client-web`, ui-slots, ui-primitives) through that prefix, disposes the previous `AppWebEntry` into the same `#root`, and constructs a new one. `window.__FREDDIE_BOOT__` is left alone. The webserver strips `/__hmr/<rev>` before route match and fallback so the prefix is only a browser module-cache key. `apps/web/src/main.js` stashes the live entry on `globalThis.__FREDDIE_SHELL__`.

**Client plugins.** Fiber swap on `rebuilt` is unchanged. A failed swap remounts the shell instead of reloading the page. Rows that call `customElements.define` still `location.reload()`, because the tag binding is document-lifetime and a remount cannot replace the class. Dispose of the bundle-watch effect clears `watchedRoots` (the map that actually holds state). `window.__FREDDIE_HMR__` is a leaf-only journal of recent frames.

**gm cwd.** `Gm.call` accepts `options.cwd`. Model tools pass `exec.agent.session.header.cwd`, so the spool is the open workspace even when the GUI host's `process.cwd()` is a different checkout.

## Alternatives considered

**Keep `loader.exit()` for externals, only reload application plugins.** That is the previous design. A framework or CLI-entry edit still killed the GUI, which is the case the operator asked to stop.

**Service Worker or import-map rewrite for shell cache-bust.** Import maps are frozen after the first module loads. A Service Worker would own every `/vendor/` fetch and outrank the existing no-cache headers. Prefixing the URL and stripping it on the host is the smaller change: one rewrite in `WebServer`, one `<base>` plus explicit prefixed `import()` for the live workspace packages.

**`location.reload()` on shell and failed plugin swap.** Honest, and already shipped. It drops `window` identity, reconnects every socket, and re-injects `__FREDDIE_BOOT__` from a new document. Remount keeps the document and the boot payload.

**Pass session cwd as gm plugin config at boot.** The host composition is process-wide; one `ctx.gm` serves every session. Per-call `options.cwd` matches how `tool-bash` already resolves `workdir`.

## Consequences

A syntax error in a host plugin rolls back module caches and re-registers the previous plugin (existing HMR rollback). A syntax error in a client plugin remounts the shell so `AppWebEntry.run` can render the boot failure page; the previous plugin fiber is not restored. Changing a `customElements.define` row still refreshes the tab. `resolveConfig` / `resolveProse` / `resolveGraph` on `ctx.gm` still read the plugin config cwd, not the per-call override — only `call()` is session-scoped.

Live verification of a host-plugin edit still requires the running process to resolve the edited source. A GUI whose cwd is a sibling checkout does not pick up harness-tree edits until that process loads this tree (or an identical file).
