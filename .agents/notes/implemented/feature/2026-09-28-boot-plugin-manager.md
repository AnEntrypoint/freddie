# Agent Note: Plugin enablement (`@freddie/freddie-plugin-manager`)

Status: implemented

## Problem

dsh's `packages/boot/plugin-manager` is a large remote surface: `listPlugins`, `listBundles`, `registries`, `inspect`, `installBundle`, `waitForInstall`, `cancelInstall`, `removeBundle`, `setBundleEnabled`, `setVersionExemption`, and `setPluginEnabled`. The deferral said freddie already has this under `packages/host/plugin-inventory` and `packages/client/ui-settings-plugins`. One part of that holds; the rest is a different package's job in freddie, and one capability of the set has no freddie owner at all.

Splitting the surface against real source:

- **`listPlugins` — already covered.** `packages/host/plugin-inventory/src/index.js:44-56` returns every non-group Loader entry with `entryId`, `moduleName`, `enabled: !entry.disabled`, and `fiberPhase`. That is the read side of the same projection, including the `enabled` bit.
- **Install, remove, inspect, registries — freddie owns them elsewhere, deliberately.** `apps/cli/README.md:12` documents `freddie plugin --profile <name> <pnpm args>` and `apps/cli/src/plugin.js:1-10` implements it: initialize the profile, run `pnpm <args...>` in the profile directory, then `reconcilePlugins` (`:58-90`) rebuilds `freddie.profile.bundles` from the *installed* state — a dependency resolving to a package declaring `freddie.bundle` joins the layer stack, a removed or bundle-less one leaves it. A second install path would own the same `package.json` under different rules.
- **`setPluginEnabled` — nothing in freddie does it.** This is the gap. It persists `disabled` for one Loader entry into the profile's patch layer and applies it live, so a disabled plugin stays disabled across a restart. Before this pass, no freddie source wrote `disabled` into a patch document: `PROFILE_PATCH_FILENAME` (`packages/boot/app-boot/src/profile.js:38`) appears only in app-boot's own reads (`profile.js:108`, `profile.js:342`) and in the live recomposition consumer (`packages/boot/app-boot/src/index.js:200-222`), and the only non-vendor `entry.update` caller was app-boot itself (`index.js:216`). Enablement existed as a hand-edited YAML fact and never as an operation.

There is no `packages/client/ui-settings-plugins` in freddie; the read side lives in `plugin-inventory`, and no UI wrote an enablement row either.

## Decision

New package `packages/boot/plugin-manager` (`@freddie/freddie-plugin-manager`) carrying **only** the enablement capability, built on the config editor rather than duplicating its document handling.

- `src/index.js` — `PluginManager extends Service`, `static inject = ['loader', 'configEditor']`, registered as `super(ctx, 'pluginManager')`. Surface: `setPluginDisabled(entryId, disabled)` → `{ entryId, disabled }`, and `entry(entryId)` resolving a Loader entry id or throwing `plugin-manager: no Loader entry <id>`.
- `src/invariant.js` — the companion every freddie package owes, registering `@freddie/freddie-plugin-manager` with an empty `install`; there is no runtime invariant this seam can assert without duplicating the Loader's own lifecycle truth.

`disabled` is written explicitly rather than cleared, because a row carrying `disabled: false` is how a profile turns a bundle's disabled row back on — and `packages/boot/app-boot/src/profile.js` composes bundle layers *below* the profile's own patch.

Adaptations, each forced by a freddie fact:

- **No `TypertRemoteService`.** dsh's manager is a `@Remote` service with eight remote methods, cancellation, and install-progress events. freddie's enablement has no client-facing protocol yet, and inventing one would be inventing a wire contract from a recollection; `plugin-inventory` already demonstrates the freddie shape for a Remote when one is wanted. This service is a plain `Service` until a caller needs a Remote.
- **No `profileContext`.** dsh injects `['loader', 'profileContext']` and reads `profile.patchPath`. freddie has no such service, so the profile is a fact owned by the editor's own config, and this service reaches it through `ctx.configEditor`.
- **Enablement is delegated, not reimplemented.** `setPluginDisabled` calls `ctx.configEditor.setDisabled(entry, disabled)`, which owns the document, the profile file lock, atomic write, rollback, and HMR serialization. This service owns only entry lookup and the meaning of the state. Duplicating the write would put two owners on one file.
- **`entry(entryId)` matches `entry.id`, not `entry.options.id`.** dsh's `listPlugins` returns `pluginEntryId(entry.id)` — the Loader tree id, which is what `plugin-inventory` also brands — and looks a row up through the patch composer to check addressability. Addressability is the editor's job here, so this service resolves the Loader tree id and lets the editor reject anything it cannot address unambiguously.

No new npm dependency: the package declares only `@freddie/*` peers (cordis, loader, config-editor, invariants).

## Alternatives considered

**Ship nothing and accept the deferral.** Rejected for the enablement half: the audit found no writer of `disabled` and no operation that flips a mounted entry. Rejected for the install half too, but in the opposite direction — porting it would create a second owner of the profile manifest.

**Port the whole manager including `installBundle`.** Rejected: `apps/cli/src/plugin.js` already owns pnpm forwarding and bundle reconciliation, and `reconcilePlugins` re-adds any installed dependency declaring `freddie.bundle` (`plugin.js:64-75`). Two install paths would fight over `package.json` and `pnpm-lock.yaml`, and dsh's restore-on-failure logic would silently disagree with freddie's reconciliation on what the manifest should say.

**Add `setPluginDisabled` to `plugin-inventory` instead.** Rejected: `plugin-inventory/src/index.js:1` declares itself a read-only projection, and its `list()` is a live Remote a client polls. Mixing a persistent write into a read projection would make every poll able to mutate state, and would put the profile lock behind a read path.

**Add it to `app-boot`.** Rejected: app-boot is the boot path every launcher shares; enablement is an operation a UI or a Remote calls after boot, which is what a Service is for.

**Expose bundle selection.** Rejected and recorded as a limitation: `reconcilePlugins` re-adds any installed dependency that declares `freddie.bundle`, so a bundle deselected here would not survive the next `freddie plugin` run. Selection stays owned by installed-state reconciliation until that rule changes.

## Consequences

Verified live on the real stack, in the same boot as the editor — real `boot()` through `packages/boot/app-boot/src/index.js`, a real scratch profile under a redirected `$FREDDIE_HOME`, real `Hmr` and `Timer`, `node --expose-internals`, no stubs and no mocks. The relevant lines from that run:

```
services present: {"editor":true,"manager":true,"hmr":true}
registry keys: ["Loader","isolate","TimerService","Hmr","Include","ConfigEditor","PluginManager","apply"]
addressable entry ids: ["include:probe","include:config-editor","include:plugin-manager"]

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

`probe` is a real mounted entry (`./live-probe.mjs`). `setPluginDisabled(probe.id, true)` wrote `disabled: true` into the profile's `cordis.patch.yml`, the entry reported `disabled: true`, and its fiber was gone (`null` — a disabled entry has no fiber). `setPluginDisabled(probe.id, false)` rewrote the same row to `disabled: false`, `probe.disabled` returned to `false`, and the fiber came back at state `2` (`ACTIVE`). The comment on the document's first line survived both writes.

`pnpm run publint` reports `packages/boot/plugin-manager` as `All good!`; run alone over just this package and the config editor it depends on, `node scripts/publint-all.js --packages-root <dir holding only these two>` exits 0 with `All good!` for each. The whole-workspace run exits 1 on three untracked packages other agents are still writing (`packages/api/session-controller`, `packages/llm/llm-pi-ai`, `packages/runtime-diagnostics/inspector`); this package is not among them.

What this buys: enablement is now a persisted, applied operation instead of a hand-edited YAML row, and it survives a restart because the row lives in the profile layer. What it costs: only entries the profile layer can address are switchable — an id the tree mounts more than once, or an entry a nested include owns, is rejected by the editor; install, remove, bundle selection, and pre-install inspection remain CLI-only by design; and there is no Remote face yet, so a UI that wants this has to add one rather than call it over the wire today.

The tree is left dirty and uncommitted.
