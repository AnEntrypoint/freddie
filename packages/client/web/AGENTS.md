# AGENTS.md — web

## CSS rationale

- `src/base.css`: shell-owned mount defaults; theme tokens arrive with the ui-theme client plugin before the loader roster activates. Form controls do not inherit the body font (UA sheets pin their families: Chrome buttons fall back to Arial, textareas to monospace), so the app stack is re-applied to them as upstream's global reset does. `src/boot-page.css`: the framework-free boot page cannot depend on theme delivery succeeding, so it carries its own values.

## Rationale

- `src/boot.js` `exportLoggerToConsole`: cordis's `LoggerService` only buffers; without a console exporter every loader, fiber and HMR error was invisible, which is why a failed rebuild left a blank page with an empty console.
- `src/boot.js` `health`/`coreEntries`: health judges the boot-roster entries and the application mount only; entries plugins mount later (dynamic packages) fail in isolation and must never make the tree look inconsistent or trigger a reload.
- `src/boot.js` `bootFailure`: a failed boot keeps its first error (the import or apply failure) because the per-entry summary that follows only lists the cascade of pending dependants.
- `src/boot.js` `mountApp`: the mount effect reports its own failure through `presentFailure` because a mount fiber that fails after boot has no awaiting caller; cordis keeps a FAILED fiber failed until a dependency changes.
- `src/boot-page.js` `attach`/`withdraw`: the boot page doubles as the failure surface after boot; `withdraw` runs when the mount is healthy again so the report never sits beside a live application.
