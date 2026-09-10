# @freddie/freddie-client-hmr

Hot reload for every buildless web source. Dynamic client-plugin packages swap their Loader fibers unless they define custom elements, which trigger a full page reload. Shell files, statically seeded live workspace packages, and linked source stylesheets emit `shell-rebuilt` and remount `AppWebEntry` under `/__hmr/<rev>/` without `location.reload`. The web bundle mounts the row unconditionally and needs no separate HMR watcher.

The browser half subscribes to the system SSE channel (`GET /plugins/events`) and reloads one plugin per `rebuilt` frame through a serialized queue. Each rebuilt frame carries the host's updated graph row, which the browser applies before `invalidate` and `prefetch`, so native `import()` uses the new cache-keyed bundle URL. The remaining sequence is `registry.delete` (before the fiber: a bare fiber dispose trips the framework Loader's self-dispose branch, which would mark the entry disabled), drain the old fiber, delete `entry.fiber`, remove owned `<style data-plugin>` tags, `entry.refresh()` re-imports and re-applies, `fiber.await()` rethrows startup failures loud. A reconnect graph revision mismatch also reloads `AppWebEntry` under `/__hmr/<rev>/`. Dependents reload through Cordis itself: a fiber's activation epoch tracks its service providers' uids, so replacing a provider fiber cascades into dependents without client-side graph analysis. The node half stat-polls dynamic served trees, the shell root, and the static package roots, retains missing rows as dirty, and broadcasts a frame only after a detected change produces a new bundle revision.

## Model Experience

None, as the reload driver is browser-side machinery; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Reload is coarse by design** — a fresh fiber and fresh components; React state inside the reloaded plugin is lost while the data layer (connection/runtime fibers, Session objects) is untouched. react-refresh-grade state preservation conflicts with "re-executing the bundle re-runs the factory" and is deliberately out.
- **No failure rollback** — a reload that fails reloads the shell under a fresh `/__hmr/<rev>/` prefix so `AppWebEntry.run` can render the boot failure page; the previous plugin fiber is not restored automatically.
- **Custom-element rows still require a full page reload** — `customElements.define` binds a tag for the document lifetime, so a fiber swap would keep the original class.
