# @freddie/freddie-api-plugin-manager-controller

The Host `pluginManager` Remote namespace: which mounted plugin entries a browser may switch, and the one write that switches an entry on or off. A Client surface reads the verdicts and calls the write through them; nothing on the wire carries a path or configuration text.

The write goes to [`@freddie/freddie-plugin-manager`](../../boot/plugin-manager/README.md), which persists the `disabled` row into the profile's `cordis.patch.yml` through [`@freddie/freddie-config-editor`](../../boot/config-editor/README.md) and applies it to the running tree. This package owns only the request shape, the refusal policy and the typed answers. The plugin manager, the config editor and the Loader are resolved lazily, so a composition that mounts none of them still boots every other namespace and these verbs answer `plugin-manager/unavailable`.

## Host service: `PluginManagerController` (ctx key: `pluginManagerController`, namespace: `pluginManager`)

| Verb | Request | Answer |
|---|---|---|
| `describe` | none | `{ entries: [{ entryId, lock, dependents }] }` for every mounted non-group entry; `lock` is `null` for an entry the browser may switch |
| `setDisabled` | `{ id, disabled }` | `{ entryId, disabled, changed }`, with `disabled` read back from the Loader after the write |

On the wire the request is the single `request` argument, so `POST /api/pluginManager/setDisabled` carries `{ "args": { "request": { "id": "include:some-entry", "disabled": true } } }`. `id` is a Loader entry id exactly as `pluginInventory/list` reports it. The request codec is strict: a missing field, a wrong type or an extra key is refused at the boundary.

`setDisabled` answers in this order: an id no mounted non-group entry carries is `plugin-manager/unknown-entry`; a locked entry is `plugin-manager/protected` with its `lock`; a state the entry already holds answers `changed: false` without touching the profile; anything else is written. Calls are serialized in this process, so two concurrent toggles run one after the other and each answer reflects the state it found. `describe` and `setDisabled` are pinned to loopback in [`client-connection`](../../client/connection/AGENTS.md).

## Locks

An entry is locked when disabling it could take down the request path, the browser shell, or the switch itself. Each verdict is re-derived from the live Loader and Fiber graph on every call.

| `lock` | Derived from |
|---|---|
| `not-addressable` | the profile layer cannot address the entry: the root include itself, an entry inserted by another entry, or an id mounted more than once (`ConfigEditor.entries()`) |
| `request-path` | the entry's module is on the explicit floor: the web server and runtime, the connection, the API gateway and proxy, the Typert registry and loader, the HMR service, the plugin manager, the config editor, this controller, the browser module servers, the tab that hosts the toggle, and the agent preset roster |
| `host-dependents` | another mounted fiber `inject`s a service that the entry's fiber tree provides, so unloading it would park that fiber |
| `client-dependents` | another browser module row lists the package in `freddie.client.inject`, or imports one of its subpaths through `freddie.client.external` |

The four locks refuse both directions, and an unknown id fails closed. `dependents` counts the mounted entries or browser rows behind a derived lock.

## Wire failures

| Code | Meaning |
|---|---|
| `plugin-manager/unavailable` | the composition mounts no plugin manager, config editor or Loader |
| `plugin-manager/unknown-entry` | no mounted non-group entry carries the id |
| `plugin-manager/protected` | the entry is locked; the answer names the `lock` |
| `plugin-manager/write-failed` | the profile write or the apply failed; the config editor restores the previous document and the error is logged on the Host, not returned |

## Model Experience

None. The package serves a management surface and registers no prompt, tool, or session event.

#### KV Cache effect

No direct effect; switching an entry off removes whatever prompt or tool contribution it carried from the next turn on.

## Known Limitations and Deferred Work

- **Optional lookups are invisible to the derivation.** `ctx.get` reads are not `inject` edges, so a leaf another entry reads at call time is not detected; the ones found on the request path (the preset roster) are on the explicit floor, and any others are a gap in the floor rather than in the graph walk.
- **A higher layer still wins.** The write targets the profile layer only. A home-level patch row or launcher overlay that pins the same entry outranks it, and the answer reports the state the Loader holds at that moment, not what a later recomposition settles on.
- **Enabling a locked entry is refused too.** A locked row that was disabled by hand-editing the profile is switched back by editing the profile, not from the browser.
- **Only enable and disable.** Installing, removing and bundle selection are not exposed; they stay with `freddie plugin`.
- **A row written from nothing stays.** Enabling an entry the profile never mentioned writes an explicit `disabled: false` row, and switching it off again keeps a row; the config editor does not remove rows.
