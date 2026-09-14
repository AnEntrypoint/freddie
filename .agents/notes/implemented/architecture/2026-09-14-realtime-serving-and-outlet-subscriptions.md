# Agent Note: Content-addressed serving, single-stylesheet + host-reload HMR, and read-tracked outlet subscriptions

Status: implemented

> Companion to the [custom-element hot-swap registry note](2026-09-14-custom-element-hot-swap-registry.md), which lets a client-plugin fiber swap carry an edit to a `customElements.define` row without a page reload. This note covers the serving layer, the HMR channel, and the browser render-subscription model changed in the same pass.

## Problem

The Web GUI re-downloaded its whole module graph on every load: `/plugins`, `/workspace`, `/styles` and the `@freddie` `/vendor` class were all `no-cache` with no validator, so a warm boot pulled ~4 MB and 956 responses again, and each plugin entry answered a `client.js` 301 before its real file. Development feedback was coarse: a CSS edit reloaded the page, a host-plugin edit was invisible in the browser, and Node 24's recursive `fs.watch` went silent for a file after an atomic (rename) write, so edits from `sed`/editors produced no rebuilt frame. Separately, the React-free outlet layer re-rendered a slot only on its slot-version, locale, or session-scoped hook sources; a root-scope entry that read `useSessions`/`useWorkspaces` had nothing subscribed to those sources, so a host-side title/model change reached the sidebar only when an unrelated event forced a rebuild — realtime in name only.

## Decision

**Content-addressed plugin URLs.** A graph row's URL is `/plugins/<id>/~<rev>/<real entry path>`; the shared static responder answers `public, max-age=31536000, immutable` when the `~<rev>` segment equals the row's current rev and `no-cache` otherwise. Import-map entries, modulepreload hints and HMR `rebuilt` frames all carry that URL, and the `client.js` alias with its 301 is gone. One shared conditional responder (`webserver/src/static-file.js`: strong `"<size>-<mtime>"` ETag + Last-Modified + 304, HEAD identical) serves `/plugins`, `/workspace`, `/styles`, `/vendor` and frontend-static, so warm loads revalidate with header-only 304s instead of full bodies.

**One stylesheet, hot-swapped.** css-manifest is a service serving one `/styles/app.css?rev=<content hash>` link (immutable on the current rev; per-file routes kept for debugging). A stylesheet-only change publishes a `css-rebuilt` SSE frame; the browser inserts a new link, waits for its load, then drops the old one — no navigation, no fiber swap. Host-plugin reloads relay framework/hmr's new `hmr/journal` event as `host-reloaded` SSE frames into `window.__FREDDIE_HMR__` and a transient header notice. The shell remount is in-document for `apps/web` + `packages/client/web` (re-import under `/__hmr/<rev>/`, `AppWebEntry.dispose()` then a new entry, window identity preserved); `ui-slots`/`ui-primitives` still reload because the import map is frozen after first load. The node HMR half arms one non-recursive `fs.watch` per directory, because Node 24's recursive watch goes silent for a path after a rename-write.

**Read-tracked outlet subscriptions.** `observableHook` records every observable an outlet's render reads (through `trackReads`, including the entry element's reads inside `applyDiff`); both outlets then subscribe to exactly that set. A host-side change to any source an entry reads now re-renders it. The entry's own declared store is read the same way, and `store.update()` drops a draft that changed nothing (`deepEqual`), so an entry that writes its store during render (AppFrame's `setNarrow`, the session tree's order sync) re-renders on real changes without looping. AppFrame's connection state is a full-width lost-link banner (reconnecting/offline only), not a pill over the header; the session header's operations strip is the single healthy-link indicator.

## Alternatives considered

**Keep `no-cache` everywhere.** Simple, but pays the full module graph on every load; content-addressing is what makes `immutable` safe, and the rev in the path is the whole cache key.

**Preload every graph row.** Measured worse (rtt40 app-mounted 16.1 s and one never-mounted run) than the `immediately` tier alone (8.3–8.9 s); only the immediately tier's 64 hints shipped.

**Bump slot version on every store write to re-render entries.** That re-renders every entry in the slot on any one store's change; subscribing each outlet to exactly the sources its own render read is narrower and is the same mechanism session-scoped hooks already used.

**Reload the page on shell/host changes.** Honest and already shipped, but drops `window` identity and reconnects every socket; the in-document remount and the host-reload notice keep the document.

## Consequences

Warm boot re-downloads ~0.09 MB instead of ~3.98 MB (694 files from cache, 140 header-only 304s), FCP 1380 → 816 ms, app-mounted 3995 → 2148 ms; cold boot 956 responses + 58 redirects → 850 + 0. A CSS edit swaps in ~33 ms with no reload; a host-plugin edit is journaled in the browser in ~130 ms and deferred while an agent turn runs, applied when it goes idle; a server restart auto-recovers the GUI in ~6.6 s with no manual refresh. Host-originated session changes (rename, model selection, prompt) reach an open GUI in ~50–170 ms. The narrow-sidebar toggle and panel drags repaint because entry-store writes now re-render their outlet.

A reload's dependency graph can still be too broad: a witnessed edit to one host plugin dropped an unrelated plugin's tool registrations. That no longer breaks the turn — `system-prompt` assembly now warns and skips a `toolOrder` name no provider registered instead of throwing, so a transient drop degrades the tool set for one turn rather than killing it, and a fresh boot restores the full set. Narrowing the partial-reload dependency graph so unrelated registrations survive at all remains future work.

## Verification

Live, in headless Chrome against the running server, same turn as the work: the cold/warm/rtt40 numbers above from one CDP driver; a real CSS edit swapping the link with a surviving `window.__probe` and no navigation; a host-plugin edit journaled as `host-reloaded` (and, during a running turn, `deferred` then `reload` with both turns `completed`); a server kill+restart recovering to a working composer and live `session.list`; rename/model RPCs from outside the browser reaching the sidebar and composer in ~50 ms; the narrow toggle moving the sidebar column from 56 px to 280 px. No test files.
