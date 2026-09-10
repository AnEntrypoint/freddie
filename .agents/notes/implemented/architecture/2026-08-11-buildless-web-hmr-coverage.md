# Agent Note: buildless web HMR coverage

Status: implemented

## Problem

The web HMR chain refreshed dynamic client-plugin packages but watched only the shell `index.html`. Edits to `apps/web/src` remained stale until a manual refresh. Client-HMR teardown also cleared an undefined watch registry, leaving its disposal path broken.

## Decision

`@freddie/freddie-client-hmr` owns polling baselines for every served dynamic client package, the resolved buildless web-shell root, and statically seeded live workspace packages. A changed dynamic package publishes its complete revised graph row through the existing SSE channel; the browser replaces that row before prefetching and refreshing its Loader entry unless its tree defines custom elements. A change to the shell, a static workspace package, or any linked source stylesheet publishes `shell-rebuilt`, which reloads the browser page. A reconnect whose graph revision differs reloads the page, recovering frames the EventSource missed. The HMR disposer clears every owned watch.

Framework HMR uses a set-backed dependency frontier and treats changed, removed, and newly cached source modules as reload candidates. The CLI supplies every first-party framework `src/` directory to that watcher and owns `Loader.exit()` as a bounded process shutdown with exit code 75, so an edit requiring a complete restart is visible to a development supervisor instead of silently retaining stale code. Active-work deferral and the ordered rollback/reload sequence remain unchanged.

## Alternatives considered

**Manual browser refresh for shell edits.** It leaves a routine buildless source edit outside the HMR contract and causes stale GUI behavior during development.

**Fiber-swap the web shell.** The shell is not a Loader entry, so it has no entry fiber to invalidate or remount. Reloading the page preserves the shell ownership boundary.

**Restart the process for every framework change.** The Loader's default `exit()` hook is intentionally host-defined. Automatic restart belongs to an entry point that explicitly owns process lifecycle.

## Consequences

Every served source file under `apps/web` participates in the same HMR notification path as a shell reload. Dynamic plugin entries retain fiber-level replacement. Full host restart remains explicit entry-point behavior. Polling still supports network-mounted workspaces without relying on filesystem event delivery.
