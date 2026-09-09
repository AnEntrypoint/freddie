# @freddie/freddie-storage-sqlite

libsql (plugkit WASM) backend for the [storage hub](../storage/README.md): one shared database over a configured `url`, registered as backend `sqlite`.

## Model

- Backed by [`libsql-plugkit-client`](https://github.com/AnEntrypoint/libsql-plugkit-client), the same stateless-WASM libsql client `../freddie` uses — no native compilation, one cross-platform `.wasm` artifact loaded via WASI.
- Every write is a real SQL statement against a shared `storage_units` table (`unit_name, table_name, key, value`); there is no in-memory authoritative snapshot like the JSON backend's. Every read issues a fresh query.
- Durability is libsql-plugkit-client's own model: a debounced (~1.5s after the last write) whole-database `sqlite3_serialize` to disk, not per-statement fsync. A process crash within that window can lose the tail of unflushed writes — accept this for workloads where the JSON backend's stricter per-call durability isn't required, or await `close()` before process exit to force a final flush.
- No WAL: the underlying `wasm32-wasi-vfs` implements no shared-memory (`xShmMap`), so `journal_mode=wal` silently declines in favor of `delete`/`memory` — verified live, not assumed. Concurrent writers from multiple processes are not this backend's story; single-host-process deployments are the current consumer, same limitation the JSON backend states for itself.
- FTS5 and vector search (`F32_BLOB`, `vector32`, `vector_distance_cos`, `vector_extract`) are both verified live against this build and available to any consumer that wants them; the `storage_vectors` table exists for a future embedding-backed data form.

## Config

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `url` | string | required — no default (a cwd fallback would scatter files) | libsql connection URL, e.g. `file:./data/storage.db` or `:memory:` |

## Model Experience

### Stored domain records

#### What the model sees

Nothing. This backend contributes no prompt, tool, or schema; it persists non-session domain data behind `ctx.storage` for host-side consumers only.

#### Token effect

Zero live-request tokens.

#### KV Cache effect

None — the backend never touches live request prefixes.

## Known Limitations and Deferred Work

- No WAL / no cross-process write coordination, per the Model section above.
- Debounced-snapshot durability trades a small crash-window loss for cross-platform deployment with no native deps — same tradeoff `libsql-plugkit-client`'s own README documents for its `@libsql/client` compatibility target.
