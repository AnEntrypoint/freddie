# @freddie/freddie-config-editor

Persistent edits to one profile's own patch layer. `ConfigEditor` registers the `configEditor` service, writes an id-targeted row into that profile's `cordis.patch.yml`, and applies the change to the running tree through the same Loader path a file edit takes.

An edit is a **complete configuration override**, not a field merge: the row's `config` replaces whatever the lower layers composed, which is what makes a value survive a restart. The candidate is validated by the entry's own fiber (`internal/config` waterfall, then `resolveConfig` against the plugin's `Config`) before anything is written, the write is atomic (file mode `0o600`) under a lock on the profile directory's `package.json`, HMR reloads are held back for the whole transaction, and a rejected apply restores the previous document.

Editing the document is a comment-preserving YAML patch, so a person's annotations in `cordis.patch.yml` survive, and a `!!js` field round-trips as `!!js` instead of collapsing into a plain string.

```yaml
- name: '@freddie/freddie-config-editor'
  config:
    profile: web
```

## Configuration

| Key | Type | Default | Effect |
| --- | --- | --- | --- |
| `profile` | `string` | required | The profile whose `cordis.patch.yml` this service writes. |

The service injects `loader` (`static inject = ['loader']`). `@freddie/cordis-plugin-hmr` is an optional peer: when its `hmr` service is present every write runs inside `hmr.runExclusive`, otherwise it runs directly. The package also exports `./invariant`, a companion that registers with the `invariants` service and asserts nothing.

## Service API

| Member | Description |
| --- | --- |
| `documentPath` | Absolute path of the patch file this service writes. |
| `entries()` | Entries the profile layer can address: those mounted by the profile's root include (the bootstrap include, id `include`), whose ids the tree mounts exactly once. |
| `document()` | Reads the patch file fresh per call, treating a missing file as an empty row list; resolves to `{ source, rows }`. |
| `configuration()` | Resolves to `{ entry, current, override }` per addressable entry — `current` is the effective config, `override` is what this profile's layer already pins. |
| `edit(entry, change)` | `change(current, override)` returns the next raw config; validates, persists, and applies it. |
| `setDisabled(entry, disabled)` | Persists and applies the `disabled` row field for one entry. |
| `write(entry, prepare)` | The transaction under `edit` and `setDisabled`: `prepare(override)` returns `{ fields, apply }`; writes the row, runs `apply`, and restores the previous document if `apply` rejects. |
| `readRows(source)` | Parses patch text with freddie's entry-list dialect; throws on a non-sequence document. |
| `setEntryFields(source, target, fields)` | Pure document rewrite: sets row fields on the last row addressing `target` (skipping `insert` rows), appends a new row when none addresses it, or returns `undefined` when nothing changes. |

## Model Experience

None, as this configuration surface registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **The profile layer is the only write target.** A home-level `cordis.patch.yml` row or a `--patch` overlay outranks the profile layer, so an id addressed there keeps the higher layer's value; this service does not detect that and does not fail the write. Upstream `config-editor` throws in that case, which needs the per-layer provenance freddie's live recomposition (`watchUserPatches`) does not expose to a service.
- **An edit always writes an explicit override.** Returning `undefined` from `change` is not a "clear": it is validated like any other value, and an accepted one is persisted as `config: null` on an existing row (or as a row with no `config` when none existed). Use `{}` to drop every override. Removing a row outright is not exposed, because the value the tree would then compose cannot be derived without the layer stack.
- **Only uniquely addressed entries are editable.** Two rows with the same id under the root include have no unambiguous target and are filtered out of `entries()`.
- **Application is a direct `Entry.update`, not a full recomposition.** The change lands immediately; the HMR watcher's own recomposition then reconfirms it from disk. Between the two, a higher layer's precedence is not re-evaluated.
