# AGENTS.md — directory-picker-auto

## Rationale

- `src/index.js` root-tree create: the Loader root is in-memory (`write()` is a no-op), so mounted rows are never persisted to a config file. The backend mounts before the surface because the surface's browser half drives the capability the backend registers.
- `src/index.js` `unmount`: skips entries `group.stop` already removed; `ctx.loader.remove` disposes transactionally, so the chooser's unload completes only after that face quiesced.
- `src/index.js` setup failure unmounts what it created before rethrowing: a mounted backend would make a retry collide with its own `directoryPicker` registration.
- Resolution is one boot-time sample (bind host, SSH launch, display, Linux chooser binary); `native` only when loopback-only bind, no SSH, and a servable display (darwin/win32 assumed; linux needs `DISPLAY`/`WAYLAND_DISPLAY` plus zenity/kdialog); anything ambiguous is `browse`. Blank env values count as unset.
- `BACKEND_PACKAGES`/`CLIENT_PACKAGES` are runtime strings the static config gate cannot see: `verify-cordis-config` requires every composing app to declare both sets as dependencies; the client packages are not imported here, so knip ignores them for this workspace.
- Pinning an interaction means composing the backend/surface pair directly instead of this row.
