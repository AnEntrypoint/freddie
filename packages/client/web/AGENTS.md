# AGENTS.md — web

## CSS rationale

- `src/base.css`: shell-owned mount defaults; theme tokens arrive with the ui-theme client plugin before the loader roster activates. Form controls do not inherit the body font (UA sheets pin their families: Chrome buttons fall back to Arial, textareas to monospace), so the app stack is re-applied to them as upstream's global reset does. `src/boot-page.css`: the framework-free boot page cannot depend on theme delivery succeeding, so it carries its own values.

## Rationale

- `src/boot.js` `exportLoggerToConsole`: cordis's `LoggerService` only buffers; without a console exporter every loader, fiber and HMR error was invisible, which is why a failed rebuild left a blank page with an empty console.
- `src/boot.js` `health`/`coreEntries`: health judges the boot-roster entries and the application mount only; entries plugins mount later (dynamic packages) fail in isolation and must never make the tree look inconsistent or trigger a reload.
- `src/boot.js` `bootFailure`: a failed boot keeps its first error (the import or apply failure) because the per-entry summary that follows only lists the cascade of pending dependants.
- `src/boot.js` `mountApp`: the mount effect reports its own failure through `presentFailure` because a mount fiber that fails after boot has no awaiting caller; cordis keeps a FAILED fiber failed until a dependency changes.
- `src/boot-page.js` `attach`/`withdraw`: the boot page doubles as the failure surface after boot; `withdraw` runs when the mount is healthy again so the report never sits beside a live application.

## Contract notes

- `src/boot-page.js` is framework-free because React arrives only with the UI renderer; it stays available when a client plugin fails. Loader status bursts coalesce into one visual update.
- `src/boot.js`: `ClientTransportHooks` are read structurally so the package takes no edge on the connection package. `mountApp` mounts through a dependency fiber so replacing `uiRenderer` remounts the app. Dispose leaves the container element in place so a later `AppWebEntry` can remount into the same `#root` after a shell-rebuilt frame. `seams.staticModules` replaces the shell-seeded table (a `/__hmr/<rev>/` remount hands in cache-busted live workspace packages). Stage-one bundle prefetch leaves failure to the import path.
- `src/loader-status.js` value-mirrors cordis's `FiberState` const enum: a const enum has no runtime object to import and esbuild-based pipelines cannot inline it across modules. Labels are keyed by member (no reverse mapping).
- `src/platform.js` is the single source of truth for shared module specifiers (seeding, bundling externals, Vite aliases, tsdown client externals), so module identities cannot drift; `src/seed.js` builds the frozen module table from it with shell-static imports so every fetched bundle resolves its externals to the same instance.
- `src/invariant.js`: no runtime invariant; the shell has no cordis events or cross-plugin mutable state, and the boot chain (loading page, settled, one-flip UI) is asserted by the web smoke e2e.
