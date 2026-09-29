# AGENTS.md — plugin-inventory

## Rationale

- Read-only, remote-only projection of non-group Loader entries, read directly on every call: cordis' internal plugin/status events already maintain `Entry.fiber` and `Fiber.state`, so a cache would be a second lifecycle truth. Fiber states are mirrored at runtime because `FiberState` is a cross-package const enum.
- `typert.host.js` and `typert.remote-client.js` are hand-owned manifests (Remote RPC schema plus reflection metadata).
