# Agent Note: The runtime reads fx:host only; the Node backend is a transitional package

Status: implemented

## Problem

[The runtime adapter](2026-11-18-runtime-adapter-for-agent-side-node-apis.md) made `@freddie/freddie-runtime` the one seam to Node built-ins, with one Node implementation (`src/node.js`) and one embedded one (`src/txiki.js`). The product's goal is to run through `fx freddie <profile>` with no Node on the path, and fx now provides every Node module the runtime imports as an `fx:host` module. The runtime package still imported all 25 `node:` modules, so it could not be loaded by fx, and the parity of fx's modules with Node's was unmeasured.

## Decision

- `packages/util/runtime/src/fx.js` maps each of the 25 seams to its `fx:host` module, and `src/install-fx.js` installs it. `src/node.js` and `src/install-node.js` are deleted from the runtime package. `test/aliases.js` fails on any `node:` or built-in import in `packages/util/runtime/src`.
- The gate was parity, measured with the shared cases run under `fx js` against fx's build: 852 of 859 cases pass, and the seven cases fx has deferred (uid and gid of another user, stdio fd 1 and fd 3, a worker reply) are recorded by exact name in `DEFERRED_FX` in `test/parity-cases.js`. The fixture check skips only those names.
- The Node-run tests that exercised the runtime moved to `fx js` (cordis `emit-contained`, typert `manifest`, host-adapter `adapter`, tools `json-schema`, ui-settings-plugins `card-form`, runtime `parity-node` and `parity-fixture`). A root `fx.importmap.json` maps the bare `@freddie/*` and third-party names they reach, because `fx js` resolves bare names through that map before any package lookup.
- The Node backend lives in its own package, `@freddie/freddie-runtime-node` (`packages/util/runtime-node`), and is **transitional**: the CLI (`apps/cli/src/bin.js`), `framework/cordis/bin.js` and the code-runtime, inspector and workflow worker threads install it, because `fx freddie <profile>` does not exist yet and the CLI still runs under Node. It is deleted when that command lands. The aliases test exempts only that package and checks that its `src/node.js` imports the Node module for every alias seam and for nothing else.

## Found on the way

`packages/util/values` decided that a constructor was native by comparing `Function.prototype.toString` with Node's exact one-line text. QuickJS prints native functions across three lines, so `isPlainRecord` rejected every plain object under `fx js`. The check now matches the native-code form with whitespace allowed. A forged constructor still fails it, and the plain-record red checks confirm that.

## Rejected

- Keeping `node.js` in the runtime package behind a switch. The package would still import every `node:` module, so fx could not load it and the aliases test could not forbid the import.
- Deleting the Node path outright. The CLI, its dump commands, the boot checks and the import smoke all run under Node and have no fx entry point yet; the window showed all of them failing the moment `install-node` was gone.
- Moving the baseline checks to `fx js`. The CLI's closure is the whole product and `fx freddie <profile>` is the command that will run it, so the move belongs to that work.

## Gave up

A Node backend stays in the tree outside the runtime package, with five consumers, until `fx freddie <profile>` lands. The seven deferred parity cases are known differences from Node, not fixed ones.
