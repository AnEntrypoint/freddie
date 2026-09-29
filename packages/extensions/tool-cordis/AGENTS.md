# @freddie/freddie-tool-cordis

## Rationale

- `src/api-catalog.js` is hand-maintained data (its generator and verify scripts no longer exist); update it with the code it describes. `inspect.js` joins live facts (service store, plugin registry) with catalog capability data; the `tools` section shows only the calling agent's scoped view.
- `src/fiber-state.js` mirrors the vendored cordis `FiberState` const enum, which has no runtime object to import.
- `invariant.js`: no runtime invariant; this adapter has no independent lifecycle stream.
