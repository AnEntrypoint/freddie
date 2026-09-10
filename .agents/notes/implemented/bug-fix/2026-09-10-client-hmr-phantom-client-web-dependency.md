# Agent Note: client-hmr's shell watch crashed the whole boot on an undeclared dependency

Status: implemented

## Problem

`packages/client/hmr/src/index.js`'s shell-source watch resolved `@freddie/freddie-client-web/package.json` with a bare, unguarded `require.resolve()` to find that package's `src/` directory and add it as a second HMR watch root alongside `apps/web`. `packages/client/hmr/package.json` never declared `@freddie/freddie-client-web` as a dependency of any kind, so pnpm's strict linker ([pnpm-over-yarn](../process/2026-06-16-pnpm-over-yarn.md)) never gave `packages/client/hmr` a `node_modules` entry for it — a phantom dependency, exactly the class of bug that linker is supposed to fail loudly on, except this call sat inside a `ctx.effect()` with no surrounding guard, so `MODULE_NOT_FOUND` propagated all the way out of `boot()` and took down the entire `web` profile instead of failing just this one plugin. `pnpm freddie web` could not boot at all.

## Decision

**Declare it, and guard it the same way its sibling already is.** `@freddie/freddie-client-web` joins `@freddie/freddie-web-frontend` under `packages/client/hmr/package.json`'s `optionalDependencies` — this watch root is a dev-convenience enhancement, not a hard requirement, matching how `resolveDistIndexIfBuilt()` already treats the frontend package as optional-and-absent-tolerant. The `require.resolve()` call moves inside the existing `try`/`catch` that already handled a resolved package's missing `src/` directory (`ENOENT`); the catch now also tolerates `MODULE_NOT_FOUND` from the resolve itself, so an absent package and a present-but-sourceless package take the identical code path: skip the extra watch root, warn on any other error.

## Alternatives considered

**Make it a required `dependencies` entry instead of optional.** Rejected: nothing about this plugin's own contract requires `freddie-client-web` to be present — `resolveDistIndexIfBuilt()` already treats the whole shell-watch feature as best-effort when the frontend package is missing, and forcing a hard dependency here would contradict that.

**Only fix the `package.json` declaration, leave the resolve unguarded.** Rejected: an optional dependency is by definition allowed to be absent from an installed tree ([the same rule the release sequences note applies to import-time optional-dependency loading](../process/2026-08-10-npm-release-sequences.md)); an unguarded resolve of an optional package reintroduces the identical crash for any consumer that installs without it.

## Consequences

`pnpm freddie web` boots again. Verified live: the exact failing `require.resolve()` call, run standalone from `packages/client/hmr/src/`, now succeeds after `pnpm install` materializes the new optional-dependency symlink; a full `pnpm freddie web` boot then serves the real client with zero console errors and all 116 `/styles/*` and `/vendor/*` requests returning 200, checked in a real browser tab, twice. A checkout that installs with `--no-optional` (or genuinely lacks `packages/client/web`) now loses only the extra HMR watch root for that package's source, not the ability to boot at all.
