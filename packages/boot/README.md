# boot/ — shared app-bin boot glue

The channel-neutral boot library shared by `apps/cli` and the [`examples/`](../examples/README.md) demo bins.

| Package | Role | ctx key |
|---|---|---|
| `app-boot/` | Shared boot glue for the app bins: `.env` loading, fail-loud Loader guards, snapshot-aware config resolution, the settle-the-tree boot sequence | (library for the bins) |
| `cmdline/` | Launcher-to-app command-line handoff and app-owned startup parsing | `cmdlineArgs`, `appExit` |
| `config-editor/` | Persistent edits to one profile's own patch layer, applied to the live tree | `configEditor` |
| `plugin-manager/` | Enablement of the plugin entries one profile's tree mounts | `pluginManager` |

The boot sequence and personal-config contract are documented in [`app-boot/README.md`](app-boot/README.md); app-owned command lines are documented in [`cmdline/README.md`](cmdline/README.md); profile patches and enablement are documented in [`config-editor/README.md`](config-editor/README.md) and [`plugin-manager/README.md`](plugin-manager/README.md).
