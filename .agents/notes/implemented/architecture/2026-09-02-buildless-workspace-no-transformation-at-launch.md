# Agent Note: Buildless workspace — no transformation at launch, no test suite

Status: implemented

> Supersedes [dsh source launch through the tsx ESM hook](2026-07-29-dsh-source-launch-tsx-esm.md) and [separate source launch from repository build](../simplification/2026-08-12-separate-source-launch-from-build.md): the workspace itself is no longer TypeScript, so there is nothing left for either decision to launch through or build ahead of.

## Problem

The whole `packages/*/*/src` graph, `apps/*/src`, `vendor/*` consumers, and every root/package-level build config were TypeScript, requiring a transformation step (native Node flags, then `tsx`'s ESM hook) before `dsh` could boot from source, and a separate `tsdown`/`tsc` build before shipping browser or Node artifacts. Both prior decisions optimized that transformation step's latency and scheduling. Neither removed the step itself.

The vitest-based test suite (`packages/*/*/tests/**`, `docs/testing.md`'s tiered policy — unit, coverage gate, real-API e2e, snapshot, web browser snapshot) assumed the same TypeScript workspace: specs lived beside `.ts` source, `vitest.config.ts` pointed `vite-tsconfig-paths` at `tsconfig.base.json`, and coverage ran against `packages/*/*/src` compiled through the same pipeline. `vitest` itself was never a declared dependency anywhere in the workspace — the suite ran through tooling outside this repo's own dependency graph, and no root script or CI workflow invoked it.

## Decision

The entire workspace is converted to buildless plain JavaScript: `packages/*/*/src`, `apps/*/src`, and the root/package tsdown configs are `.js`, ESM, importable and runnable directly under plain `node` with zero transformation. `pnpm dsh` runs `node apps/cli/src/bin.js` — no `tsx`, no `--experimental-transform-types`, no source-launch vector distinct from the shipped artifact's own require graph. `tsdown` is the one remaining build step, and it exists only to produce browser bundles (`lib/client.js`) and the Node `lib/` mirror for packages that declare one — never to make source runnable, which it already is.

The vitest suite is removed in full: every `tests/**`/`test/**` directory across the workspace, `docs/testing.md`, and the dangling `native/landlock-run` `test`/`test:entry`/`test:launcher` package scripts. Verification is exhaustive live execution against the real running system in the same change as the work — boot the real app or example, drive the actual code path, read the real output — never a test file authored alongside its own fix.

Two packages (`host/directory-picker-native`, `workflow/workflow-worker-thread`) kept a leftover `import.meta.url.endsWith('.ts')` branch selecting between an unbuilt-source `tsx/esm` bootstrap and a pre-built worker; since every source file in the workspace is now `.js`, that check can never be true and the branch was dead. `directory-picker-native`'s worker source has no build-only syntax, so its host now spawns `src/win32-dialog-worker.js` directly under plain `node`, dropping its `lib/worker.cjs` build entry and `./worker` export entirely. `workflow-worker-thread`'s worker stays built: `scripts/build-exe-for-python-sdk.js`'s `@yao-pkg/pkg` packaging step needs the worker as CommonJS (pkg's VFS `Worker` hook only compiles CJS), a real constraint neither superseded note's removal touches.

## Alternatives considered

**Keep the test suite, port its `vitest.config.ts`/`tsconfig.base.json` wiring onto the buildless source tree.** Rejected: the suite's entire tiering (coverage gate on `packages/*/*/src`, built-artifact smokes distinguishing source vs. `lib/` planes, `vite-tsconfig-paths` path resolution) is built around a TypeScript-to-JavaScript compilation boundary that no longer exists — every "source plane vs. artifact plane" test in the removed suite tested a distinction this workspace no longer has. Porting it would mean re-deriving a testing architecture for a codebase shape it was never designed for, not reusing existing work.

**Keep `tsx` as a launch-time no-op shim for source files that happen to already be plain JS.** Rejected: `tsx`'s ESM hook adds real, measured latency (`../architecture/2026-07-29-dsh-source-launch-tsx-esm.md` records ~0.4s versus plain launch) for zero benefit once there is no TypeScript syntax left for it to transform.

**Leave the two dead `.ts`-branch checks in place as harmless unreachable code.** Rejected for `directory-picker-native` (removing it also removed a whole unnecessary build step and export); kept as a live decision for `workflow-worker-thread` only insofar as the CJS worker build itself stays — the dead branch check came out there too, since it could never fire either way.

## Consequences

- `pnpm dsh` and every other source entry point run with zero transformation latency and zero TypeScript tooling dependency; `typescript`, `tsx`, and `vite-tsconfig-paths` are gone from the root and from every package except `packages/typert/generator` (a real TS-AST analyzer, dependency genuinely needed), `host/directory-picker-native`'s and `workflow/workflow-worker-thread`'s own `tsx` uses for bootstrapping *consumer*-authored TypeScript at runtime (unrelated to this workspace's own source), and `apps/web`'s stress-test fixture (left as-is, its `typescript`/`@types/node` devDependencies removed as unused).
- There is no automated regression suite. Every non-trivial change requires live verification in the same PR — a real boot, a real build, real output read back — per the root `AGENTS.md` verification-policy convention this note backs.
- `directory-picker-native` no longer ships or builds `lib/worker.cjs`; its dialog worker runs straight from `src/`, one fewer artifact to keep in sync with source.
- `workflow-worker-thread` keeps its CJS `worker.cjs` build and `pkg`-packaging dependency unchanged; this note does not touch it.
- The prior notes' node-compat launch-vector smoke (`apps/cli/tests/source-launch.compat.spec.ts`) and the missing-artifact diagnostics specs both prior notes cited as verification no longer exist; there is no replacement automated pin for the launch vector's exact command shape. A regression there surfaces only through the live-verification discipline this note establishes, not a gate.

## Verification

Live `node apps/cli/src/bin.js web` boot with a real browser: zero console errors, plugins load correctly, sessions and workspaces resolve. `tsdown --env.FREDDIE_BUILD_FACE host`/`client` both green (210/210 and 140/140 builds, later 209/209 and 139/139 after `directory-picker-native`'s build-entry removal, 0 errors either way). `node --check` on every converted file. `native/landlock-run`'s own `entry.test.js` run directly confirms its buildless entry package still resolves and probes correctly; `launcher.test.js` correctly self-skips off-Linux.
