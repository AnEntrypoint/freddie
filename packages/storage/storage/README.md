# @freddie/freddie-storage

Storage hub (`ctx.storage`) for non-session data: a named backend registry plus mounted data-form facilities. The hub performs no IO itself — backends own media, and data forms own semantics. The [storage family overview](../README.md) maps those packages; the [domain KV storage Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md) records the design rationale.

One plugin provides the hub and its one backend: it registers the JSON backend as `json` and takes the backend's `root` as its config.

## Config

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `root` | string | required, no default (a cwd fallback would scatter files) | Directory holding the `json` backend's unit files; created `0o700` on demand |

## Shape

- `ctx.storage.backend` — name → backend table. Multiple backends stay mounted side by side; which backend serves a consumer is that consumer's configuration (the domain layer's route table), never a hub-global choice. `register()` returns the disposer; duplicate names and unknown lookups fail loud.
- `ctx.storage.mount(form, facility)` / `ctx.storage.form(form)` — data-form mounting. `StorageForms` is merge-extensible; the domain layer merges `domain` and is reached as `ctx.storage.domain`.
- A backend owns one medium and exposes the data-shape facets it supports. `kv` is the current facet; `src/backend.js` owns its exact contract.

## The json backend

One human-readable `<unit>.json` file per unit under `root`, registered as backend `json` (`src/json-backend.js`, `src/unit.js`, `src/atomic.js`, `src/format.js`). The in-memory unit state is authoritative; every write primitive republishes the whole file via temp-write, fsync and an atomic `rename()` replace, so a unit file is always the complete current net state. A missing file opens as an empty unit and materializes on the first write. A foreign or unparsable file rejects with `malformed-medium`; a stored version that differs from the descriptor rejects with `version-mismatch` (no migration, pre-release stance). Write ordering across calls belongs to the caller; each single call is atomic and durable once resolved.

## Model Experience

### Backend and form registrations

#### What the model sees

Nothing. `ctx.storage` is a host-side registration table; the hub registers no tools, injects no prompts, and writes no session events.

#### Token effect

Zero direct tokens on every request.

#### KV Cache effect

Independent of live requests: the hub never touches a request prefix, so it cannot invalidate provider cache reuse.

## Known Limitations and Deferred Work

- **`kv` is the only data shape** — backends currently have one facet to implement.
- **Forms resolve lazily** — reading `ctx.storage.domain` before the domain plugin mounts throws `form-not-mounted`; assemblies order plugins accordingly (misconfiguration fails loud rather than silently deferring).
- **No cross-process write locking** — two processes writing the same root can interleave whole-file replacements (last write wins). Single-host-process deployments are the current consumer; the multi-process story is deferred per the [domain KV storage Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md).
