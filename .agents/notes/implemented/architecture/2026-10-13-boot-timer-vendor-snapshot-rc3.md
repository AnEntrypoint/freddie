# Agent Note: boot page drops its 1 Hz elapsed timer without a new vendor snapshot

Status: implemented

## Problem

`packages/client/web/src/boot-page.js` started `setInterval(() => this.scheduleRender(), 1000)` for the startup clock. Only `dispose()` cleared it, and `withdraw()` (the normal post-mount path) did not, so the detached boot page re-rendered once a second for the life of the page.

## Why no snapshot was published

The browser requests `/vendor/@freddie/freddie-client-web@0.1.1-rc.2/src/boot-page.js`, but `packages/client/vendor-modules/src/index.js` (`resolveLiveWorkspaceFile`) maps any `@freddie/freddie-client-web@<version>/<path>` to the live workspace file, and `scripts/generate-vendor.mjs` never writes files of `LIVE_WORKSPACE_PACKAGES`. No frozen copy serves this page, so a `0.1.1-rc.3` directory would be inert and the generator would not write it. The manifest, the old snapshot and the cordis vendor copy are unchanged.

## Decision

Delete the interval, its field and its `clearInterval`. Elapsed startup time refreshes on every loader status event, which already drives rendering. Trade-off: while startup is stalled with no status events, the `Startup time Ns` label shows the value from the last event instead of ticking.

## Verification

Headless Chrome over CDP, with `window.setInterval` wrapped by `Page.addScriptToEvaluateOnNewDocument`, app at `http://127.0.0.1:3080/`:

- before: one interval registered at `boot-page.js:54` (1000 ms), 5 fires over 5 s of idle
- after: zero intervals registered, zero fires; the boot page rendered progress through all 52 services and the app mounted
- console: no errors or exceptions in either run
