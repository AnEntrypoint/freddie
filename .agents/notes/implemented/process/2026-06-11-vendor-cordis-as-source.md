# Agent Note: Vendor Cordis as source, not npm dependencies

Status: implemented

## Problem

Freddie is built on the Cordis framework. Cordis core was at 4.0.0-rc.6 (a release candidate) when this repo started; the harness depends on framework internals (fiber lifecycle, effect disposal, waterfall dispatch) whose exact behavior matters to the agent loop's correctness guarantees.

## Decision

Copy the needed Cordis packages (core, loader, include, group, timer, hmr, logger-console) and the cordiverse foundation libraries (cosmokit, schemastery) into the repository as source, flattened, so workspace resolution is transparent. `pnpm-workspace.yaml` sets `linkWorkspacePackages: true`, so those names resolve to these workspaces in both source and built-artifact execution. Truly third-party dependencies (js-yaml, chokidar, @standard-schema/spec, …) stay on npm.

That directory is now `framework/`, and the layer it holds is maintained first-party: every package was rewritten from TypeScript to plain JavaScript, the packages carry the `@freddie` scope, and there is no upstream sync procedure. [`framework/README.md`](../../../../framework/README.md) records each package's ancestor repo and fork point, and its Divergence log records what departs from that ancestry and why.

## Alternatives considered

- **Depend on the npm packages** — rejected: core was at a release candidate, and the harness leans on framework internals (fiber lifecycle, effect disposal, waterfall dispatch) whose exact behavior the agent loop's correctness guarantees depend on; an upstream RC bump could break them without a local fix path.
- **Vendor everything transitively** — rejected: truly third-party dependencies (js-yaml, chokidar, @standard-schema/spec, …) stay on npm; only the framework layer whose internals matter is owned.

## Consequences

- The harness fully owns its framework layer: auditable, patchable — an RC upstream can't break us, and we can fix framework bugs in-tree.
- Built packages execute the same Cordis generation as source runs; removing workspace linking would silently substitute npm copies behind these package names.
- Ownership was the durable consequence. The layer diverged far enough that no upstream sync is possible or wanted, so the packages are edited here directly and the Divergence log carries the rationale for non-obvious shapes.
- One departure exists from day one: hmr's locale-YAML imports removed (the runtime YAML import hook is not part of this layer).
