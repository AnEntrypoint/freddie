# Agent Note: buildless web HMR coverage

Status: implemented

## Problem

The web HMR chain refreshed dynamic client-plugin packages but watched only the shell `index.html`. Edits to `apps/web/src` remained stale until a manual refresh. Client-HMR teardown also cleared an undefined watch registry, leaving its disposal path broken.

## Decision

`@freddie/freddie-client-hmr` owns one polling baseline for every served dynamic client package and another for the resolved buildless web-shell root. A changed package publishes its content revision through the existing SSE channel and refreshes its Loader entry unless its tree defines custom elements; custom-element packages publish a rebuild frame that reloads the browser page. A changed shell file publishes `shell-rebuilt`, which also reloads the browser page. The HMR disposer clears the owned client watch registry.

Framework HMR uses a set-backed dependency frontier and treats changed, removed, and newly cached source modules as reload candidates. Active-work deferral and the ordered rollback/reload sequence remain unchanged.

## Alternatives considered

**Manual browser refresh for shell edits.** It leaves a routine buildless source edit outside the HMR contract and causes stale GUI behavior during development.

**Fiber-swap the web shell.** The shell is not a Loader entry, so it has no entry fiber to invalidate or remount. Reloading the page preserves the shell ownership boundary.

**Restart the process for every framework change.** The Loader's default `exit()` hook is intentionally host-defined. Automatic restart belongs to an entry point that explicitly owns process lifecycle.

## Consequences

Every served source file under `apps/web` participates in the same HMR notification path as a shell reload. Dynamic plugin entries retain fiber-level replacement. Full host restart remains explicit entry-point behavior. Polling still supports network-mounted workspaces without relying on filesystem event delivery.
