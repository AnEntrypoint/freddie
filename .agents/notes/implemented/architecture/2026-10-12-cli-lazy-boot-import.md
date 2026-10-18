# Agent Note: CLI entry loads the app-boot package lazily

Status: implemented

## Problem

`apps/cli/src/bin.js` statically imported `@freddie/freddie-app-boot` at the top of the module. That package pulls in js-yaml, the Cordis core, the plugin loader, include and group plugins, home-path resolution and launch-environment snapshotting. Only the profile branch of `bin.js` calls `loadLayeredEnv`. Every other invocation, including `--help`, `--version` and the `plugin` and `dump-config` modes, paid for that graph at startup. Measured on Windows 11 with node 24.15.0, `node apps/cli/src/bin.js --help` took 410-980 ms per run in a six-run sample before the change.

## Decision

`bin.js` imports `@freddie/freddie-app-boot` with a dynamic `import()` inside the `profile` case, immediately before `loadLayeredEnv` is called. The static import is removed. Argument parsing (`args.js`, which needs `commander`) and the `expose-internals` re-exec stay static, because `--help` and `--version` need them and nothing else.

Alternating A/B over ten runs on the same machine (old static import versus new lazy import, `--help`): old median 332 ms (range 278-366), new median 245 ms (range 201-490). Output of `--help`, `--version`, `--profile web --dump-default-config` and `--profile <missing> --help` is unchanged. The `--profile <missing> --help` run still reaches `loadLayeredEnv` and `runProfile`, so the profile branch is exercised.

The app-boot module has no top-level side effects, so evaluating it later changes no observable ordering.

## Alternatives considered

**Why not a precomputed static help table?** Commander already renders the help text and the output must stay byte-identical. A hand-kept table would duplicate it and drift the first time a command or option changed.

**Why not trim app-boot's own imports?** The graph is shared by every profile path, and splitting it is a larger change than deferring the one import that `--help` never reaches.

**Why not make `commander` lazy too?** `--help` and argument errors need it on every path, so deferring it saves nothing.

## Consequences

The non-profile CLI paths no longer load the Cordis and js-yaml graph. The profile path has one extra dynamic import step, which is negligible next to the work it precedes. A future static import of `loadLayeredEnv` or another app-boot export into `bin.js` would silently restore the cost; reviewers should keep the import inside the profile case.
