# @freddie/freddie-plugin-manager

Runtime enablement of one profile's Cordis plugin entries. `PluginManager` registers the `pluginManager` service and exposes one operation, `setPluginDisabled(entryId, disabled)`, which writes the state into that profile's `cordis.patch.yml` and applies it to the running tree.

Enablement is a profile-owned fact rather than an in-memory toggle: the row is persisted, so a disabled plugin stays disabled across a restart and a re-enabled one comes back on the next boot. The write goes through [`@freddie/freddie-config-editor`](../config-editor/README.md), which owns the document, the profile file lock, and HMR serialization; this service owns only the entry lookup and the meaning of the state.

```yaml
- name: '@freddie/freddie-config-editor'
  config:
    profile: web
- name: '@freddie/freddie-plugin-manager'
```

## Service API

The service injects `loader` and `configEditor` (`static inject = ['loader', 'configEditor']`), so it mounts only after both are active.

| Member | Description |
| --- | --- |
| `setPluginDisabled(entryId, disabled)` | Persists and applies the `disabled` row field for one Loader entry; resolves to `{ entryId, disabled }`. |
| `entry(entryId)` | Resolves a Loader entry id to its entry, throwing when no mounted entry carries it. |

The browser reaches `setPluginDisabled` through [`@freddie/freddie-api-plugin-manager-controller`](../../api/plugin-manager-controller/README.md), which owns the wire request and refuses the entries the request path depends on; this service itself performs no such check.

Reads are not duplicated here: [`@freddie/freddie-host-plugin-inventory`](../../host/plugin-inventory/README.md) already projects every mounted entry with its `enabled` state and Fiber phase.

## Model Experience

None, as this management surface registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **Install and remove are not this service's job.** `freddie plugin --profile <name> <pnpm args>` forwards to pnpm in the profile directory and reconciles `package.json`'s bundle list; a second install path would own the same manifest with different rules.
- **Bundle selection is not exposed.** `freddie plugin`'s reconciliation re-adds any installed dependency that declares `freddie.bundle`, so a bundle deselected here would not survive the next `freddie plugin` run. Selection stays owned by installed-state reconciliation until that rule changes.
- **Pre-install inspection is not exposed.** `freddie plugin` leaves spec resolution and version reporting to pnpm, which already fails loud on an unknown spec.
- **Only entries the profile layer can address are switchable.** An entry whose id the tree mounts more than once, or that a nested include owns, has no unambiguous row and is rejected by the editor.
