# Agent Note: Rescope vendored Cordis into @deepseek-ai

Status: implemented

## Problem

The nine packages under `framework/` kept their upstream npm names (`cordis`, `cosmokit`, `schemastery`, `@cordisjs/plugin-*`). That premise does not survive publication: every harness package declares `cordis` as a peer dependency, so a consumer installing `@freddie/freddie-*` must resolve it from the registry, which means publishing the harness publishes this framework layer too. Publishing it under the upstream names squats them on the registry, and where that registry proxies npmjs, the same-name entries shadow the real upstream packages and install the wrong framework into unrelated projects.

## Decision

All nine packages move into the `@deepseek-ai` scope. Directory names, inherited version numbers, and dependency ranges stay untouched, so `framework/README.md`'s package table still records each package's ancestry. [docs/rescope.md](../../../../docs/rescope.md) restates this mapping for consumers.

| Directory | npm name | Upstream name |
|---|---|---|
| `cordis/` | `@freddie/cordis` | `cordis` |
| `cosmokit/` | `@freddie/cosmokit` | `cosmokit` |
| `schemastery/` | `@freddie/schemastery` | `schemastery` |
| `loader/` | `@freddie/cordis-plugin-loader` | `@cordisjs/plugin-loader` |
| `include/` | `@freddie/cordis-plugin-include` | `@cordisjs/plugin-include` |
| `group/` | `@freddie/cordis-plugin-group` | `@cordisjs/plugin-group` |
| `timer/` | `@freddie/cordis-plugin-timer` | `@cordisjs/plugin-timer` |
| `hmr/` | `@freddie/cordis-plugin-hmr` | `@cordisjs/plugin-hmr` |
| `logger-console/` | `@freddie/cordis-plugin-logger-console` | `@cordisjs/plugin-logger-console` |

The rewrite touches only **delimited, complete package-name tokens**: quoted or backticked specifiers (optionally with a `/subpath`), `package.json` names and dependency keys, `cordis.yml` `name:` values, and `tsconfig.base.json` `paths` keys. Identically spelled strings that are not package names therefore stayed as they were: the `cordis.yml` config-file family, the Loader's literal `cordis:` builtin prefix (`cordis:include`, `cordis:group` — see `framework/loader/src/config/tree.js`), kind strings like `cordis-config-entry`, `@freddie/freddie-tool-cordis`, Schemastery's upstream `Symbol.for('schemastery')` and `vendor:` metadata field, the `packages/<group>/` directory names in `GROUP_ORDER` (`scripts/gen-module-graph.ts`, `scripts/gen-doc-graphs.ts`), and the inherited install instructions in `framework/*/README.md`.

Two classes are invisible to a token rule and were renamed site by site. First, property access — `manifest.peerDependencies?.cordis` — where TypeScript cannot catch a stale `Record<string, string>` key. Second, constants that carry the name as data: the framework set in `check-workspace-constraints.ts`, the group/include names in `verify-cordis-config.ts`, the `declare module` target strings in `cordis-walk.ts`, `gen-scoped-events.ts`, and typert's `analyzer.ts`, and `alwaysBundle` in `app-boot/tsdown.config.ts`.

Markdown splits along what a reader does with it. Every fence follows the rename regardless of its info string, because a fence is code they copy or configuration they mount — the `yaml` fences naming Loader plugins and the `ts ignore-check` fences beside compiled ones included. Prose follows it under `docs/`, where a tutorial sentence quoting a name teaches something this repository no longer resolves. Prose elsewhere — `framework/*/README.md`, package READMEs, and `.agents/notes/` — keeps the names it was written with, both because it records what was true then and because the same spelling can mean something else: the Python SDK's `cordis` option, the unadopted `@cordisjs/plugin-http`, or an agent-preset id.

## Consequences

- No upstream name remains in the publication set. `publish-npm-baseline.js` now requires every published package to be `@freddie/*` with no framework-layer exemption, so regressing the rename fails before packing.
- The `framework/README.md` package table gains an upstream-name column; `gen-third-party-notices` parses six columns and renders that name into `THIRD_PARTY_NOTICES.md`, keeping MIT attribution pointed at each fork's origin rather than our scope.
- `pnpm-workspace.yaml` drops the `cordis` and `@cordisjs/plugin-loader` `minimumReleaseAgeExclude` entries, which can no longer be fetched from a registry, and `knip.json` drops the `@cordisjs/.+` ignore pattern that `@freddie/.+` already covers.
- Bringing an upstream change into one of these packages means writing it here by hand against the scoped names; there is no copy step to re-run the rename over. `pnpm run rescope-vendor --apply` remains the codemod that established the mapping, and its mapping and the package table's two name columns must agree.
- **Returning to the official upstream packages** means applying that mapping in reverse — `pnpm run rescope-vendor --apply --reverse` — then restoring the two `minimumReleaseAgeExclude` entries and relaxing the publication-set assertion. It spans roughly 1300 files, so replay it with the script rather than by hand.

`scripts/rescope-vendor.js` owns the rename: the mapping, the delimited-token rule, the per-file exemptions where a name is a directory instead of a package, the exact edits above, and a `--check` mode (`pnpm run rescope-vendor:check`) asserting no residue, every exact edit landed, and idempotency. A rebase replays it instead of resolving a 1300-file conflict, and a change to one of the pinned sites fails the run loudly instead of being silently skipped.

## Alternatives considered

**Keep the upstream names and exclude `framework/` from publication.** Rejected because every harness package declares `cordis` as a peer dependency, so an installed `@freddie/freddie-*` would have no resolvable framework.

**Rename only at pack time.** Rejected because the published names would disagree with the source tree, every module specifier would have to be rewritten inside the publish path, and no local run could reproduce what was published.

**Unify versions on the repository base version too.** Rejected because a `0.0.1` version would no longer satisfy the preserved `^4.0.0-rc.7` ranges, so pnpm would look for a registry copy instead of resolving these packages from the workspace. Renaming the directories was also rejected here as out of scope for the rescope, since directory names are not publication identity; the layer was renamed to `framework/` separately, for what the name told a reader about ownership.

**Rewrite prose outside `docs/` and historical Agent Notes as well.** Rejected because those record what was true when written, and a bare `cordis` there is as likely to be an SDK option name or a preset id as a package; `docs/rescope.md` carries the mapping for readers instead.
