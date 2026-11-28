# @freddie/freddie-runtime-node

The Node host backend of the runtime seam. `src/node.js` builds the 25-member runtime object from Node's built-in modules; `src/install-node.js` installs it through `installRuntime` from `@freddie/freddie-runtime`. Node hosts import `@freddie/freddie-runtime-node/install-node` as their first import: `apps/cli/src/bin.js`, `framework/cordis/bin.js` and the worker entries of code-runtime-worker-thread, inspector and workflow-worker-thread.

## Transitional

`@freddie/freddie-runtime` reads `fx:host` only. This package exists because `fx freddie <profile>` (specs/fx-freddie-txiki.md, Stage 6) does not exist yet, so the CLI still runs under Node. Delete it when that command lands: remove the package, switch its five consumers to whatever fx installs, and drop their dependency lines and the lockfile links.

## Guard

`packages/util/runtime/test/aliases.js` keeps this package from spreading. It exempts only `packages/util/runtime-node/` from the rule that shipped code imports no `node:` module, and it checks that `src/node.js` imports the Node module for every alias seam and for nothing else.

The retirement plan, with the replacement for each check, is the [runtime-node retirement note](../../../.agents/notes/proposed/architecture/2026-11-28-runtime-node-retirement-plan.md).

Beyond the Node built-ins it provides the `pty` seam (`@freddie/freddie-runtime/pty`, `spawn(file, args, { cwd, env, cols, rows })`) over `node-pty`. Under fx the same seam is `src/fx-pty.js` over `pty.open`, which fx 9b0167c8 and f76a0af3 do not have; its `pty.spawn(file, args)` takes no cwd, env or size, has no `pid`, `resize` or `kill`, and its `read()` blocks the thread.
