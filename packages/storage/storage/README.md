# @freddie/freddie-storage

Storage plugin for non-session data: the JSON-file backend and the typed domain facility, `ctx.storageDomain`. A domain is declared once with `defineDomain` (zod record schemas, `z.infer`-derived types), opened through `DomainFacility.open`, and served as in-memory reads with durable, ordered writes. Design rationale, open semantics and the layer split: the [Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md) (frozen; it describes the earlier hub, registry and three-package layout, which this package replaced because there was one backend and one data form). Reference: [docs/subsystems/storage.md](../../../docs/subsystems/storage.md).

## Config

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `root` | string | required, no default (a cwd fallback would scatter files) | Directory holding the `json` backend's unit files; created `0o700` on demand |

## The json backend

One human-readable `<unit>.json` file per unit under `root` (`src/json-backend.js`, `src/unit.js`, `src/atomic.js`, `src/format.js`). The in-memory unit state is authoritative; every write primitive republishes the whole file via temp-write, fsync and an atomic `rename()` replace, so a unit file is always the complete current net state. A missing file opens as an empty unit and materializes on the first write. A foreign or unparsable file rejects with `malformed-medium`; a stored version that differs from the descriptor rejects with `version-mismatch` (no migration, pre-release stance). Write ordering across calls belongs to the domain's write chain; each single call is atomic and durable once resolved. `src/backend.js` owns the backend contract (`kv` is the only facet).

## Model Experience

### Durable domain state

#### What the model sees

Nothing. The package registers no tools, injects no prompts, and appends no session events; it stores non-session data (workspace records, session sidecars) behind `ctx.storageDomain` and emits only the in-process `domain/changed` event, which reaches a model only if a Consumer package renders it through its own documented surface.

#### Token effect

Zero. No text from this package enters any model request.

#### KV Cache effect

Independent: domain reads and writes never touch request prefixes, so nothing here can invalidate provider cache reuse.

## Known Limitations and Deferred Work

- **No cross-process write locking** — two processes writing the same root can interleave whole-file replacements (last write wins). Single-host-process deployments are the current consumer.
- **Single-process change visibility** — `domain/changed` is an in-process event; a second host process or a reconnecting GUI observes no changes until the cross-process revision pattern deferred in the Agent Note lands.
- **No cross-table transactions, secondary indexes, or multi-segment keys** — each write touches one record.
- **`kv` is the only data shape** — the backend contract has one facet.
