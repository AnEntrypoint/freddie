# Agent Note: SDK initialize validates required wire fields

Status: implemented

## Problem

`HarnessSdkJsonRpcServer.initialize` read `params.cwd`, `params.provider` and `params.model` without checking them. A peer sending an `initialize` frame without those fields got `-32603` with Node's `The "paths[0]" argument must be of type string. Received undefined` from `path.resolve`, and a frame with only some of them silently stored `undefined` provider and model. The wire boundary gave no error naming the missing field, so a malformed handshake was indistinguishable from a runtime fault. The validation runner's SDK probe sent ACP-shaped params, which is how the symptom was recorded as a broken baseline check.

## Decision

`packages/sdk/server/src/server.js` rejects an `initialize` frame whose `cwd`, `provider` or `model` is absent or not a non-empty string with a `TypeError` naming that field, before resolving `cwd` or mounting an adapter. The three fields are required by the SDK wire contract: the removed `@freddie/freddie-sdk-client` sent all three from `DeepSeekHarness.start()`, and `cwd` becomes the created session's header value. The server and protocol READMEs state the requirement and the `-32603` error shape. `packages/sdk/protocol/src/transport.js` already collapses non-object params to `{}`, so the check also covers a frameless request. The validation runner sends SDK-shaped params for its SDK probe and ACP-shaped params for its ACP probe.

## Alternatives considered

- **Default missing fields to the class fields (`process.cwd()`, `deepseek-official`)** — rejected: a silent default hides a broken client, and the provider/model pair is a deployment choice the caller owns; the wire has no documented default.
- **Validate only `cwd`, leaving `provider`/`model` to fail later at agent creation** — rejected: the error would surface at `session/prompt` instead of the handshake, after `initialize` already answered success.
- **Change the check harness only and leave the server untouched** — rejected: the harness bug and the missing boundary check are separate defects; fixing only one leaves malformed peers with an opaque Node error.

## Consequences

- A malformed `initialize` now fails at the readiness boundary with a field-named error; a valid handshake still returns `serverInfo.name` `freddie-sdk-runtime` and its `session/prompt` receipt.
- Clients that relied on omitting `cwd`, `provider` or `model` no longer initialize. No client in this checkout does; the shipped SDK client sent all three.
- The baseline's `sdk-initialize` row changes from "answers with an error reply" to "pass", and the four profile dumps stay byte-identical because no configuration row changed.

## Verification

`node runs/analysis/baseline.mjs after-verify sdk-initialize` returns `PASS` with the `serverInfo` result. `node runs/analysis/sdk-negative.mjs` checks three malformed frames and their field-named errors. `node runs/analysis/sdk-prompt.mjs` drives a real initialize-then-`session/prompt` sequence and reads a `messageId` receipt. `node runs/analysis/baseline.mjs after-verify dump-sdk,acp-initialize,dump-web,dump-headless,dump-acp,headless-no-key` passes with the recorded md5 values; `pnpm run publint` passes.
