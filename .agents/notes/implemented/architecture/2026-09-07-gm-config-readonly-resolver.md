# Agent Note: JS gm-config resolver is read-only over on-disk tiers

Status: implemented

## Problem

`ctx.gm` could only answer `gm.config.json` by dispatching a spool verb. A hung project ticker then made config reads wait 120s. A second resolver that cloned remotes or ran `hooks/*.js` would drift from rs-plugkit and take code-execution trust.

## Decision

`@freddie/freddie-gm-config` reads already-materialized files in the same first-usable-wins order as rs-plugkit `config.rs`: ProjectVendored (`.gm/gm.config.json`) when present and valid; ProjectRepoSpec / UserRepoSpec when a hashed cache already exists (a missing cache is Rejected, never cloned); ImplicitDefaultRepo serves `.gm/config-source-cache-default`; BuiltinDefault is the last fallthrough. A malformed vendored file or source spec is Rejected and falls through. Clone, fetch, and hook execution stay daemon-owned. `ctx.gm.resolveConfig` / `resolveProse` / `resolveGraph` call this package and never the spool.

The group README is the package home. `docs/architecture.md` stays loop/seam-level and does not grow a gm-config row.

## Alternatives considered

**Dispatch `instruction` / a dedicated spool verb for config.** Rejected: that path hangs when the project ticker stalls, which is the bug this walk hit.

**Clone AnEntrypoint/gm-config from the harness.** Rejected: `config_sync.rs` already owns debounce, lock dir, and depth-1 clone. A JS clone would fight those cache dirs.

## Consequences

A cold project with no cache and no vendored file resolves to BuiltinDefault until the daemon materializes `.gm/config-source-cache-default`. Compiled-default prose baked into `gm.wasm` is not re-derived. `resolveHookPath` returns a filesystem path and never evaluates it.
