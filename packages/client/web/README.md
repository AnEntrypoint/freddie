# @freddie/freddie-client-web

Web boot kernel: `new AppWebEntry(el, seams?).run()` mounts the client through two stages. The module stage dynamically imports `createClientModuleSystem` from `@freddie/freddie-client-modules/client` and calls it with `window.__FREDDIE_BOOT__`, the shell's static modules, and any test transport override (a pre-injected `globalThis.__FREDDIE_TRANSPORT__` or the explicit `seams` override); the call returns the constructed module system and its parsed manifest. This package then prefetches the `immediately` tier. The plugin stage mounts the framework Cordis Loader, injects that module system through the Loader's `internal` interface, creates every graph entry uniformly, and waits for every fiber to become ACTIVE. It then hands the marked boot DOM to the dynamic UI renderer's `ctx.uiRenderer.mount(el)` operation; the renderer hydrates that DOM before switching to the complete UI. The Host owns the graph, parser preloads, and facade; AppWebEntry does not know the bootstrap package id or parse the wire format.

The boot page uses plain DOM and local CSS, so client-bundle and plugin-activation failures remain visible. Its fallback fonts and colors match the theme tokens that arrive during loading. Loader status updates drive its native progress value, discovered-ready summary, actionable readiness grid, dependency report, current-entry label, and elapsed startup time; its denominator contains only entries the Loader has reported, so an expected roster that is still registering cannot look like stalled loading. State bursts coalesce visual reconciliation to one animation frame. Hydration preserves its spinner node and animation phase until the application commit. React mounting, slot rendering, application assembly, and browser-title projection live in [`ui-renderer`](../ui-renderer/README.md). The modules bundle caches its own materialized exports and provides the closed-over system when its ordinary graph entry activates; Cordis service waiting makes graph-row creation order independent from that activation.

`PLATFORM_MODULES` (src/platform.ts) is the single source of truth for shell-seeded shared modules. Together with `PRELOADED_CLIENT_EXTERNALS`, it defines the implicit external baseline for every dynamic bundle; `freddie.client.external` adds only exact non-baseline requests.

The optional override parameter `seams` forwards the module system's `loadBundle` transport override (`BootSeams`) for environments where external `<script>` execution cannot reach the page context; ordinary browser callers omit it. A pre-injected page transport is the default ahead of it: when `globalThis.__FREDDIE_TRANSPORT__` (the connection package's `ClientTransportHooks`) carries `loadBundle`, the module stage adopts it as the bundle transport and skips the immediate-tier HTTP prefetch — explicit `seams` still win.

## Model Experience

None, as the entry shell boots the browser plugin tree; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The application waits for the full roster** — one failed entry keeps the framework-free boot page visible with a per-entry report; partial UI availability is not supported.
