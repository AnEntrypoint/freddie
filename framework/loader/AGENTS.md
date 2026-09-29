## Rationale

Non-obvious reasons behind code in `framework/loader/src`. Divergences from upstream live in `framework/README.md` (Divergence log entries 8, 15, 18), not here.

- `index.js` `internal/plugin` handler: it persists `disabled: true` only for a genuine self-dispose (`ctx.fiber.dispose()` on an entry's root fiber). It returns early when the fiber is only being created, is not tracked by an entry, is a child plugin under the entry, is being removed by plugin deletion (hmr order is `delete(plugin)` -> runtime dispose -> fiber dispose, whereas self-dispose is fiber dispose -> `delete(plugin)`, hence the `ctx.registry.has(...)` check), belongs to a tree that is unloading, is mid-`_disposing`, or was disabled by loader behaviour (inject checker, config file update, ancestor group disable).
- `index.js` `unwrapExports()`: the second `default` unwrap when `__esModule` is set handles esbuild default-interop output (evanw/esbuild#2623, esbuild content-types "default-interop").
- `config/tree.js` `import()`: `info.offset += 3` skips the three Node-internal frames (`ModuleJob.run`, `onImport.tracePromise.__proto__`, `internal.import`) when composing long stack traces. The `/* @vite-ignore */` markers are bundler pragmas and must stay.
- `config/entry.js` `Entry.options` starts empty and an entry is not usable until `entry.update()` is called right after construction.
- `config/group.js` `create()`: an existing entry may be moved from another group, so its `parent` is reassigned before `update(options, true, true)`, whose `create` flag replaces the existing `entry.options`. On failure the previous parent (or the new store slot) is rolled back.
- Known gap: `index.js` `internal/plugin` handler resolves `fiber.entry.options.inject` into `fiber.inject` with `Inject.resolve`, so an entry-level inject config replaces the plugin-declared config for that service instead of merging with it; no freddie package declares an object inject config today.
