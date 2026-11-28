# Agent Note: Freddie on edge.js, stage 4

Status: implemented

## Problem

fx is moving to edge.js, which is Node 24 compatible, as its only engine ([edge-js spec](/workspace/hyperagent/specs/edge-js.md), stage 4). The gap list written against fx's txiki build (process signals, `fs.watch`, JSON modules, `Intl`, global `process` and `require`, native addons, `worker_threads`, a pty) described a runtime that is going away, and two seams written for it (`pty`, `image`) would never be used.

## Decision

Freddie runs on the edge.js binary directly (`edge apps/cli/src/bin.js ...`, edge 0.2.5-g57af363, Node 24.13.2), with no fx in between. Checked under edge: `--help`; the dumps of all four profiles, byte-equal to Node (headless `fee112a5`, acp `5f3c3c96`, sdk `38b3ee75`, web `0cdf19d8`); a full headless model turn against a local OpenAI-compatible server (`FAKE-ANSWER`, same as Node); acp and sdk `initialize` (sdk needs stdin held open, on Node too); the web profile serving 49221 bytes at `/`, as Node does; `worker_threads`; and loading `node-pty`, `sharp` and the landlock addon, with `sharp` transforming an image.

Two freddie-side changes made that work: `resolveFrom` (`framework/loader/src/resolve.js`) resolves bare plugin names from a base URL without Node's internal loader, used when there is none, and 176 bundle rows resolve identically under Node and `resolveFrom`; and the CLI skips HMR and patch watching when there is no internal loader. Under edge the internal loader still works when `--expose-internals` is set (the web profile re-executes itself with it); only the `node-addon-require-builtin` fallback is skipped.

The `pty` and `image` seams were reverted: edge loads the addons, so freddie keeps `node-pty` in subprocess-local and `sharp` in attachment-local.

## Edge defects found

- `node-addon-require-builtin`'s `requireBuiltin` aborts the whole process with `FATAL ERROR: Error::ThrowAsJavaScriptException napi_throw` when it throws, instead of raising a catchable error.
- `node-pty`: `onData` fires, `onExit` never does (a child that exits after one second, a timer at three seconds, no exit event). subprocess-local's terminal handles wait on `onExit`.

## Rejected

- Collapsing `@freddie/freddie-runtime` to direct `node:` imports now. Edge makes the `fx:host` backend dead code, but fx's edge build is not the default yet and the runtime seam is what the Node path and the aliases guard rest on; the deletion list (install-fx, fx.js, the fx:host rows in aliases.json, the fx js tests and their import map) is gated on fx stage 2.

## Gave up

The fx-side findings (shebang, `process.on`, `fs.watch` and the rest) were written against txiki and are not re-verified; fx's edge build supersedes them.
