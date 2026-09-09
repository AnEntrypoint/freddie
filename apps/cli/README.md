# `@freddie/freddie`

The `freddie` command is the product launcher for profiles: ordered stacks of plugin-bundle patch layers under the user's own overrides. [`src/args.ts`](src/args.ts) owns the command grammar, and [`src/bin.ts`](src/bin.ts) loads only the selected runner. Invalid commands, options from another mode, configuration errors, and boot failures exit nonzero.

## Entry modes

| Command | Purpose |
|---|---|
| `freddie --profile <name>` | Boot the named profile under `$FREDDIE_HOME/profiles/<name>`. |
| `freddie --profile headless "job"` | Run one fresh persisted session, print the final answer, and exit. |
| `freddie web` | Alias of `--profile web`. |
| `freddie plugin --profile <name> <pnpm args>` | Manage a profile's plugins by forwarding to pnpm in the profile directory. |

The invoking directory is the default workspace root. The `web` and `headless` profiles auto-initialize on first use from shipped templates; any other profile must be created through `freddie plugin`.

## App arguments

The launcher parses only its own flags and hands everything after them to the booted profile, where any injected app plugin may parse the shared immutable snapshot ([`freddie-cmdline`](../../packages/boot/cmdline/README.md)). Launcher flags therefore come first, and the first token the launcher does not recognize starts the app's arguments:

```sh
freddie --profile web --port 8080       # --port belongs to the web app
freddie --profile tui --resume <id>     # example, assuming the tui profile is installed; --resume belongs to the terminal app
freddie --profile headless "run the tests"
freddie --profile web --help            # the web app's flags, not the launcher's
freddie --help                          # the launcher's own help
```

## Profiles

A profile directory holds a `package.json` (out-of-tree plugin dependencies plus the profile manifest `freddie.profile` with its ordered `bundles` list) and a `cordis.patch.yml` (the user's own patch layer).

The tree composes over an empty root:
- each bundle's patch in `freddie.profile.bundles` order
- then the profile's `cordis.patch.yml`, then the home-level `$FREDDIE_HOME/cordis.patch.yml`
- then `--patch` overlays

Bundles named in `freddie.profile.bundles` resolve from the freddie installation first (`@freddie/freddie-base`, `@freddie/freddie-web-app`, `@freddie/freddie-headless`), then from the profile's own `node_modules`, where pnpm installs out-of-tree plugins.

Use `--dump-default-config` and `--dump-config` to inspect the composed tree without booting it.

The [CLI behavior reference](reference/README.md) owns exact layer precedence, flags, shutdown behavior, deployment defaults, and source execution.

## Development

The workspace is buildless: from the repository root, `pnpm freddie <args...>` runs `apps/cli/src/bin.js` directly under Node and forwards every argument — no build step is required, in a fresh checkout or otherwise; the [source-execution reference](reference/README.md#source-execution) owns the module-resolution contract.
