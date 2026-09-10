# @freddie/freddie-client-hmr

Hot reload for every buildless web source: dynamic client-plugin packages swap their Loader fibers unless they define custom elements, which trigger a full page reload; shell files under `apps/web` also reload the page. The web bundle mounts the row unconditionally and needs no separate HMR watcher.

The browser half subscribes to the system SSE channel (`GET /plugins/events`) and reloads one plugin per `rebuilt` frame through a serialized queue. The sequence per frame — `invalidate`, `prefetch` (load and register the new bundle while the old fiber still serves), `registry.delete` (before the fiber: a bare fiber dispose trips the framework Loader's self-dispose branch, which would mark the entry disabled), drain the old fiber, delete `entry.fiber`, remove owned `<style data-plugin>` tags, `entry.refresh()` re-imports and remounts, `fiber.await()` rethrows startup failures loud. Dependents reload through Cordis itself: a fiber's activation epoch tracks its service providers' uids, so replacing a provider fiber cascades into dependents without client-side graph analysis. The node half stat-polls every served client package and the buildless shell root, retains missing rows as dirty, and broadcasts a frame only after a detected change produces a new bundle revision.

## Model Experience

None, as the reload driver is browser-side machinery; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Reload is coarse by design** — a fresh fiber and fresh components; React state inside the reloaded plugin is lost while the data layer (connection/runtime fibers, Session objects) is untouched. react-refresh-grade state preservation conflicts with "re-executing the bundle re-runs the factory" and is deliberately out.
- **No failure rollback** — a failed fiber swap reloads the page instead of restoring the old bundle, so the shell startup path renders any remaining error.
- **Graph rev is not refreshed by rebuilt frames** — the stale rev is harmless because the bundle endpoint serves no-cache; only reconnect refreshes it.
- **Host process restart remains host-owned** — an edit to a framework dependency that requires a full process restart calls the Loader's `exit()` hook; entry points that need restart-on-edit must implement that hook.
