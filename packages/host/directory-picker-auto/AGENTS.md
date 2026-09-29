# AGENTS.md — directory-picker-auto

## Rationale

- `src/index.js` root-tree create: the Loader root is in-memory (`write()` is a no-op), so mounted rows are never persisted to a config file. The backend mounts before the surface because the surface's browser half drives the capability the backend registers.
- `src/index.js` `unmount`: skips entries `group.stop` already removed; `ctx.loader.remove` disposes transactionally, so the chooser's unload completes only after that face quiesced.
- `src/index.js` setup failure unmounts what it created before rethrowing: a mounted backend would make a retry collide with its own `directoryPicker` registration.
