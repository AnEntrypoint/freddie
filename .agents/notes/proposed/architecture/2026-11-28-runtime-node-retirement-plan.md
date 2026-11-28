# Agent Note: Retiring runtime-node, check by check

Status: proposed

## Problem

[`@freddie/freddie-runtime-node`](../../../packages/util/runtime-node) is the Node backend of the runtime seam, kept only because `fx freddie <profile>` could not yet run the CLI. Everything the Node CLI carries has to move before it goes, and each check needs a stated replacement, or removing the package silently deletes coverage.

## What the Node CLI carries

Consumers of the package: `apps/cli/src/bin.js`, `framework/cordis/bin.js`, the three worker entries (`code-runtime-worker-thread`, `inspector`, `workflow-worker-thread`, each `src/worker.js`), and two Node-run test files in `session-persistence-jsonl/test`. The aliases test exempts the package.

| Check (runs/analysis/baseline.mjs) | Needs the Node CLI for | Replacement under fx | Needs from fx |
| --- | --- | --- | --- |
| `cli-help` | `freddie --help` output and version | `fx freddie --help` with the same output | shebang strip, `node:events` |
| `dump-web`, `dump-headless`, `dump-acp`, `dump-sdk` (md5 of `dump-config --profile X`) | the composed config of each profile | `fx freddie <profile> dump-config`; the md5s are the gate, and the cut is allowed only when the Node and fx dumps are byte-equal | same, and fx must pass arguments to `bin.js` |
| `headless-no-key` | exit code and the `MISSING_CREDENTIAL` line | `fx freddie headless "task"` | exit code and stderr passed through |
| `acp-initialize`, `sdk-initialize`, `demo-acp`, `demo-cordis-acp`, `demo-code-mode` | JSON-RPC over the CLI's stdin and stdout | the same requests to `fx freddie acp` and `fx freddie sdk` | stdin and stdout passed through |
| `web-boot` (GET `/`, then every asset) | the web profile serving HTTP | `fx freddie web`, then the same GET and asset sweep | `serve` in the runtime (landed) and the profile reaching it |
| `import-smoke` (every package entry imports) | `node` per package, 241 packages | one `fx js` run that imports each entry in turn and records failures | the same missing node modules, so it fails where the CLI does |
| `install`, `publint`, `third-party-notices`, `rescope-vendor-check`, `release-verify-*`, `aliases` | nothing (tooling) | stay under Node: the node-free goal covers the shipped product | none |
| `session-persistence-jsonl` conformance and its crash child | runtime-node as the test's runtime | install `install-fx` and run under `fx js`, as the fx store's harness already does | `fx js` arguments, or the payload file the fx harness uses |
| code-runtime, inspector and workflow worker entries | `worker_threads` plus the runtime in the worker | `install-fx` in the worker; the worker entry runs once fx has `worker_threads.Worker` | the deferred `Worker` parity case |
| `framework/cordis/bin.js` | the standalone cordis CLI | `fx js` entry, or delete it if nothing uses it | none |

## Order

1. fx strips the shebang and provides `node:events`; `fx freddie headless` then boots on the real checkout. Until it does, nothing below can be tried.
2. Run each profile's dump under both runtimes and require byte-equal output. This is the parity gate for the whole retirement and needs no fx beyond step 1.
3. Move the acp, sdk and web checks to `fx freddie`, one per window, each green under both runtimes for one window before the Node variant is dropped.
4. Switch `bin.js` and the worker entries to `install-fx`, move the jsonl conformance to `fx js`, and replace `import-smoke`.
5. Delete the package, its aliases exemption and the transitional rows in the docs. The baseline then runs through `fx freddie`.

## Rejected

- Deleting the package first and rebuilding the checks after. The window would have no CLI checks in between, which is what the earlier removal of `install-node` showed.
- Keeping a Node dump check forever as a second witness. Two runtimes producing the same dump is the retirement gate, not a permanent cost.

## Gave up

Until fx supports `worker_threads.Worker`, the three worker entries keep Node, so the package can only be deleted when that case is no longer deferred or those workers are cut.
