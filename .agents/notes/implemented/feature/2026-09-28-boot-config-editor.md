# Agent Note: Profile patch editor (`@freddie/freddie-config-editor`)

Status: implemented

## Problem

dsh's `packages/boot/config-editor` supplies exactly one capability: take a change to one plugin entry's configuration, validate it against that entry's own fiber, persist it into the profile's own `cordis.patch.yml` as one id-targeted row, and apply it to the running tree — holding HMR reloads back for the whole transaction so the reload the write triggers cannot dispose the fibers the apply just restarted.

freddie had no writer of that file at all, which overturns the deferral. The audit is a file:line audit, not a name audit:

- `PROFILE_PATCH_FILENAME` (`packages/boot/app-boot/src/profile.js:38`) is referenced only where app-boot *reads* it (`profile.js:108`, `profile.js:342` in `loadProfile`) and where the live layer recomposition *consumes* it — `packages/boot/app-boot/src/index.js:200-222`, `watchUserPatches` → `entry.update({ config: { ...includeConfig, patches } })`.
- `entry.update` over `packages` has exactly one non-vendor, non-config-editor caller: `packages/boot/app-boot/src/index.js:216`. Where a vendor copy exists (`packages/client/vendor-modules/vendor/@freddie/cordis-plugin-loader@1.0.2/src/config/{group,tree}.js`) it is the Loader's own reconfiguration, not a persistence seam.
- No freddie source writes `disabled` into a patch row. Runtime enable/disable of a mounted entry did not exist.

The three alleged equivalents are not equivalents:

- `packages/boot/cmdline/src/index.js:32-36` — `provideCmdline` gives the tree its argv snapshot and its exit request. It parses nothing, persists nothing, and edits nothing.
- `packages/host/plugin-inventory/src/index.js:1` (`/** Read-only projection of the current Cordis Loader plugin entries. */`) and `:44-56`, where `list()` returns `enabled: !entry.disabled`. It reads `disabled`; it never writes it.
- `packages/client/hmr/src/index.js:1-9` — the browser-facing half: it watches *served source roots* and emits rebuild frames (css-manifest rev, `shell-rebuilt`, `host-reloaded`) over `/plugins/events`. It is not the host-side reload queue and has no transaction surface.

## Decision

Port it as `packages/boot/config-editor` (`@freddie/freddie-config-editor`), written from `deepseek-ai/deepseek-harness`'s `packages/boot/config-editor/src/index.ts` read off raw.githubusercontent.com.

- `src/index.js` — `ConfigEditor extends Service`, `static inject = ['loader']`, registered as `super(ctx, 'configEditor')`. Surface: `documentPath`, `entries()`, `document()`, `configuration()`, `edit(entry, change)`, `setDisabled(entry, disabled)`, and the internal `write(entry, prepare)` transaction. `readRows(source)` and `setEntryFields(source, target, fields)` are exported pure functions so the document logic is exercisable without booting a tree.
- `src/invariant.js` — the companion every freddie package owes: `ctx.invariants.register(PACKAGE_NAME, install)`. `install` is deliberately empty; there is no runtime invariant this seam can assert without duplicating the Loader's own entry-lifecycle truth, and registering a placeholder would be worse than registering none.
- `framework/hmr/src/index.js` — gained the queue the apply step needs: `operations`, `executing` (`AsyncLocalStorage`), `closing`, `joinQueue()`, and `runExclusive()`. Rationale recorded as divergence log entry 23 in `framework/README.md`.

Adaptations, each forced by a freddie fact rather than by preference:

- **No `profileContext`.** dsh's service injects `['loader', 'profileContext']` and reads `profileContext.patchPath`, `.dir`, `.installAnchor`, `.startedBundles`. freddie has no such service; profile resolution is `resolveProfileDir(name, home)` plus `PROFILE_PATCH_FILENAME` (`packages/boot/app-boot/src/profile.js`). The profile therefore became a config value: `Config = z.object({ profile: z.string() })`, and `documentPath` is `join(resolveProfileDir(this.config.profile), PROFILE_PATCH_FILENAME)`.
- **`inherited` is not derivable, so `override` is what the caller sees.** dsh's `configuration()` computes `inherited` by `loadProfileDirectory(...)` + `composeEntries([...layers, patches])` and its `edit()` passes `inherited` as the second argument to `change`. freddie exports no `installAnchor`-anchored full-layer loader, so guessing at a lower layer would be inventing a value. `edit()`'s second argument is the profile layer's own last `config` row for that id — what dsh calls `override` — and `configuration()` returns `{ entry, current, override }`.
- **An edit always writes an explicit override.** dsh deletes the `config` key (and the whole row) when `next` deep-equals `inherited`, letting the value fall through to lower layers. Since `inherited` is unavailable, the row is always written. To keep a repeated no-op edit from costing the comments inside `config`, `setEntryFields` returns `undefined` when every target field already deep-equals what is in the document, and `write()` then skips both the write and the apply.
- **Application is a direct `entry.update`, not a full recomposition.** dsh calls `reconcileProfilePatches(root, patches, 'dsh', [id])` and then verifies `effective.config` deep-equals `next`, refusing with `overridden by a home patch or command-line overlay` when a higher layer wins. freddie's recomposition is `watchUserPatches` (`packages/boot/app-boot/src/index.js:200-222`), not an exported reconcile function, so `write()` applies with `entry.update({...})` and the HMR watcher's own recomposition reconfirms it. Higher-layer precedence is consequently *not* detected here and is recorded as a limitation rather than faked.
- **Rollback restores the previous document text.** dsh re-runs `reconcileProfilePatches(root, beforePatches, 'dsh')` after restoring; freddie rewrites the prior bytes with `writeFileAtomic(path, source, { mode: 0o600 })`.
- **freddie's own lock and atomic-write seam.** `withFileLock(join(dirname(path), 'package.json'), …)` — the same profile-root lock the CLI's package operations take — and `writeFileAtomic` from `@freddie/freddie-atomic-write`, the same pair `packages/settings/settings-file/src/index.js:16` uses. No new locking code.
- **HMR serialization is conditional.** `const hmr = this.ctx.get('hmr'); await (hmr === undefined ? run() : hmr.runExclusive(run))`. A boot without HMR still works; a boot with it cannot have a debounced reload land mid-apply.
- **Two YAML readers, on purpose.** Values are read with js-yaml + `entryListSchema` (`@freddie/cordis-plugin-include`), the dialect the Include actually mounts, so `!!js` arrives as `{ __jsExpr }`. The edit is made with eemeli `yaml`'s `parseDocument` carrying `customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }]`, so the document keeps `!!js` verbatim and every untouched node keeps its comments; a `visit` pass turns `{ __jsExpr }` back into a tagged `Scalar` before `String(document)`. Verified live: `disabled: !!js env.FREDDIE_TELEMETRY_DISABLED !== undefined` survives a rewrite of a neighbouring row unchanged.

No new npm dependency beyond what freddie already installs: `js-yaml` and `yaml` are both already in the workspace graph (`@freddie/cordis-plugin-include` uses the former, and the latter is the comment-preserving editor). Everything else is a `@freddie/*` peer.

## Alternatives considered

**Accept the deferral and ship nothing.** Rejected: the audit found no writer of `cordis.patch.yml` anywhere in freddie, and no code path that persists an enable/disable decision. The gap is real.

**Put the writer inside `app-boot` next to `watchUserPatches`.** Rejected: app-boot is the boot path every launcher shares; a service that a UI or a Remote can call has to be mountable and disposable, which is what a Service is for, and putting it in app-boot would make the boot path depend on an editing surface it does not need.

**Reuse `packages/settings/settings-file`.** Rejected: it owns `$FREDDIE_HOME/settings.yaml` and its own schema/render pipeline. Patch rows need `entryListSchema` and an `!!js` dialect, and a second owner of a different file through the same class would couple two documents' write paths.

**Port dsh's `inherited` by inventing an `installAnchor`.** Rejected: fabricating a lower-layer value would make `edit()` write a row on a premise freddie cannot verify, and the whole point of the reduction is that the written row is the one thing the profile layer actually owns.

## Consequences

Verified live on the real stack — a real `boot()` through `packages/boot/app-boot/src/index.js`, a real scratch profile under a redirected `$FREDDIE_HOME`, real `Hmr` and `Timer` plugins, and `node --expose-internals` — no stubs, no mocks. The script writes the profile, boots a tree mounting `./live-probe.mjs`, the editor, and the manager, then exercises each operation and prints the patch file after every step:

```
root services: 3
entries: [{"id":"include","name":"cordis:include","disabled":false,"fiber":2,"error":null},{"id":"include:probe","name":"./live-probe.mjs","disabled":false,"fiber":2,"error":null},{"id":"include:config-editor","name":"@freddie/freddie-config-editor","disabled":false,"fiber":2,"error":null},{"id":"include:plugin-manager","name":"@freddie/freddie-plugin-manager","disabled":false,"fiber":2,"error":null}]
registry keys: ["Loader","isolate","TimerService","Hmr","Include","ConfigEditor","PluginManager","apply"]
services present: {"editor":true,"manager":true,"hmr":true}
editor.documentPath: C:\dev\freddie\.gm\dsh-audit\live\home\profiles\audit-scratch\cordis.patch.yml
editor owner entry id: null
hmr present: true
addressable entry ids: ["include:probe","include:config-editor","include:plugin-manager"]
probe configuration: [{"id":"include:probe","current":{"profile":"audit-scratch"},"override":{}},{"id":"include:config-editor","current":{"profile":"audit-scratch"},"override":{}},{"id":"include:plugin-manager","current":{},"override":{}}]
runExclusive order: ["slow-start","slow-end","fast"]
nested runExclusive: rejected: HMR transactions cannot be nested
edit sees current: {"profile":"audit-scratch"}
edit sees override: {}
patch after edit: # scratch profile overrides
- id: probe
  name: ./live-probe.mjs
  config:
    profile: audit-scratch-edited

probe config applied: {"profile":"audit-scratch-edited"}
invalid edit: rejected: invalid config:
  - $.profile expected string but got 42 (at profile)
patch unchanged after invalid edit: # scratch profile overrides
- id: probe
  name: ./live-probe.mjs
  config:
    profile: audit-scratch-edited

patch after disable: # scratch profile overrides
- id: probe
  name: ./live-probe.mjs
  config:
    profile: audit-scratch-edited
  disabled: true

probe disabled: true
probe fiber after disable: null
patch after enable: # scratch profile overrides
- id: probe
  name: ./live-probe.mjs
  config:
    profile: audit-scratch-edited
  disabled: false

probe disabled after enable: false
probe fiber after enable: 2
```

What those lines establish: fiber state `2` is `ACTIVE`, so all four entries mounted; `runExclusive order` proves a 150 ms transaction completes before a later caller's transaction starts; the nested call is *rejected*, not deadlocked; `edit()` validated `{"profile":42}` through the entry's own fiber via `internal/config` + `resolveConfig` and left the file byte-identical (`patch unchanged after invalid edit`); disable/enable round-trips the persisted row and the live fiber (`null` → `2`). The outer comment `# scratch profile overrides` survived every rewrite, which is the comment-preservation property the eemeli-`yaml` path exists for.

A separate `exec_js` run exercised the two pure functions directly, including the `!!js` round trip:

```
rows: [{ id: 'web-search-deepseek', config: { baseUrl: 'https://api.deepseek.com' } },
       { id: 'skill-badge', disabled: { __jsExpr: 'env.FREDDIE_TELEMETRY_DISABLED !== undefined' } }]
next: "# my profile overrides\n- id: web-search-deepseek\n  config:\n    baseUrl: https://api.deepseek.com\n    timeout: 30000\n- id: skill-badge\n  disabled: !!js env.FREDDIE_TELEMETRY_DISABLED !== undefined\n"
noop: "# my profile overrides\n- id: web-search-deepseek\n  config:\n    baseUrl: https://api.deepseek.com\n- id: skill-badge\n  disabled: !!js env.FREDDIE_TELEMETRY_DISABLED !== undefined\n"
added: "...\n- id: brand-new\n  name: \"@freddie/freddie-brand-new\"\n  disabled: true\n"
reparsed: [{ id: 'web-search-deepseek', config: { baseUrl: 'https://api.deepseek.com', timeout: 30000 } },
           { id: 'skill-badge', disabled: { __jsExpr: 'env.FREDDIE_TELEMETRY_DISABLED !== undefined' } }]
```

`noop` is the second call with an identical value: it returned `undefined`, so no document was rewritten and the comments inside `config` were not lost.

`pnpm run publint` (which runs `node scripts/publint-all.js` over all 265 workspace packages) reports `packages/boot/config-editor` and `packages/boot/plugin-manager` as `All good!`. Run alone over just the two packages — `node scripts/publint-all.js --packages-root <dir holding only these two>` — the script exits 0 with `All good!` for each. The whole-workspace run exits 1 on three *other* packages (`packages/api/session-controller`, `packages/llm/llm-pi-ai`, `packages/runtime-diagnostics/inspector`), all untracked trees other agents are still writing; `git status` lists all three as untracked and neither of these packages is among them.

What this buys: one place that turns "configure this plugin" into a persisted profile row plus a live apply, with the value validated before the file changes and the write atomic under the profile lock. What it costs: it writes only the profile layer and cannot see a home patch or `--patch` overlay outranking it; every edit is an explicit override rather than a fall-through to a lower layer; only uniquely-addressed entries under the root include are editable, so an id the tree mounts twice is rejected; and the apply is a direct `entry.update`, not a full recomposition, so a row that another layer also writes is applied without the precedence check dsh makes.

The tree is left dirty and uncommitted.
