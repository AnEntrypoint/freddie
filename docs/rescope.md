# Framework package scope

The Cordis framework and its foundation libraries live under [`framework/`](../framework/README.md) and are published under the `@freddie` scope, because every harness package declares the framework as a peer dependency: publishing the harness publishes this layer with it, and under the original names that publication would squat them on a registry we do not own. This page is the name mapping; the decision and its consequences live in the [rescope Agent Note](../.agents/notes/implemented/process/2026-08-10-vendor-package-rescope.md), and what diverged from the upstream ancestor in [`framework/README.md`](../framework/README.md).

## Name mapping

| Directory | Descended from | Published name | Version | Role |
|---|---|---|---|---|
| `framework/cordis/` | `cordis` | `@freddie/cordis` | 4.0.0-rc.7 | Framework core: `Context`, `Service`, `Fiber`, events |
| `framework/cosmokit/` | `cosmokit` | `@freddie/cosmokit` | 1.8.1 | Shared utilities the framework and Schemastery build on |
| `framework/schemastery/` | `schemastery` | `@freddie/schemastery` | 3.18.0 | Config schemas (`Schema`) behind every plugin's `Config` |
| `framework/loader/` | `@cordisjs/plugin-loader` | `@freddie/cordis-plugin-loader` | 1.0.0-rc.5 | `cordis.yml` loading, plugin resolution, repository cache |
| `framework/include/` | `@cordisjs/plugin-include` | `@freddie/cordis-plugin-include` | 1.0.4 | Config includes and patch overlays |
| `framework/group/` | `@cordisjs/plugin-group` | `@freddie/cordis-plugin-group` | 1.0.0 | Nested plugin groups |
| `framework/timer/` | `@cordisjs/plugin-timer` | `@freddie/cordis-plugin-timer` | 1.1.2 | Disposal-aware timers on `ctx` |
| `framework/hmr/` | `@cordisjs/plugin-hmr` | `@freddie/cordis-plugin-hmr` | 1.0.15 | Hot module replacement for plugins and config |
| `framework/logger-console/` | `@cordisjs/plugin-logger-console` | `@freddie/cordis-plugin-logger-console` | 1.0.0 | Console logger exporter |

Subpath exports keep their path: `@cordisjs/plugin-loader/repository` becomes `@freddie/cordis-plugin-loader/repository`.

## What the rename does not touch

- **Directory names and versions.** `framework/hmr/` stays `framework/hmr/`, and every package continues the version line its table row records.
- **Dependency ranges.** A dependency entry changes its key, never its range: `"cordis": "^4.0.0-rc.7"` becomes `"@freddie/cordis": "^4.0.0-rc.7"`. `linkWorkspacePackages` resolves those preserved ranges to the pinned workspaces.
- **The Loader's `cordis:` builtin prefix.** `cordis:include` and `cordis:group` are a protocol prefix, not a package name.
- **The `cordis.yml` configuration family**, including `*.cordis.yml`, `*.cordis.snapshot.yml`, and `cordis.patch.yml`.
- **Harness packages whose own names contain the word**, such as `@freddie/freddie-tool-cordis`.
- **Inherited runtime identifiers**, such as Schemastery's `Symbol.for('schemastery')` and its `vendor:` metadata field. These are wire identifiers, not package references.
- **Prose outside `docs/`.** `framework/*/README.md`, package READMEs, and Agent Notes keep the names they were written with; a bare `cordis` there can also be the Python SDK's option name or an agent-preset id. Inside `docs/`, prose and every Markdown fence follow the rename.

## What your code has to change

| Site | Before | After |
|---|---|---|
| Module import | `import { Context } from 'cordis'` | `import { Context } from '@freddie/cordis'` |
| `package.json` dependency key | `"@cordisjs/plugin-hmr": "^1.0.15"` | `"@freddie/cordis-plugin-hmr": "^1.0.15"` |
| `cordis.yml` plugin entry | `name: '@cordisjs/plugin-include'` | `name: '@freddie/cordis-plugin-include'` |

## Applying, verifying, and reverting

[`scripts/rescope-vendor.js`](../scripts/rescope-vendor.js) owns the mapping above and performs the rename, so no reference is renamed by hand:

```sh
pnpm run rescope-vendor            # report what would change
pnpm run rescope-vendor --apply    # rewrite every reference
pnpm run rescope-vendor:check      # assert the post-state
pnpm run rescope-vendor --apply --reverse   # return to the original names
```

The rename is already applied across the tree; the codemod remains as the mapping's executable definition and as the check that no new reference reintroduces an unscoped name. If it ever writes again, follow it with the regeneration it prints: `pnpm install` for the lockfile, and `pnpm run gen-third-party-notices`.
