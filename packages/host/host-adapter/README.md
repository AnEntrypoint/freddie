# @freddie/freddie-host-adapter

The generic adapter between freddie's Cordis plugins and the `fx:host` module of the host interface. It reads the host's capability list and registers one Cordis service for each row whose capability the host reports, so a native capability reaches freddie's code without a per-capability package.

```js
import host from 'fx:host'
import { createHostAdapter } from '@freddie/freddie-host-adapter'

ctx.plugin(createHostAdapter(host))
```

## The host shape it reads

Checked against the live `fx run-code` host (`scripts/fx-live-check.mjs`): `version.interface` is 1; `capabilities` is a list of names (`tools`, `verbs`, and the Node module names of the host's module table); `tools` is an object of 47 tool functions keyed by the model-visible name; `verbs` is an object of 22 host verb functions; `modules` maps each module name to its implementation.

## The table

`src/services.js` is the one table. Each row is keyed by a spec id and gives the Cordis service, the `capability` the host lists it under (`null` for a gap), the `source` it reads (`tools`, `verbs` or `modules`), the `key` inside `modules`, the `members` it exposes (`null` means all), and a `reason` for a gap. The `tools.*` rows partition the tools, so each tool belongs to one service. `UNREPORTED_TOOLS` names the one published tool the host leaves out. `VERB_BACKS` says which capability each host verb serves.

## Rows over fx's Stage 2 host

The table registers 18 of its 25 rows on the live host. The serve, pty, sqlite, dns and watch rows are the ones fx's Stage 2 added: `net.server` reads `serve.serve` (it listens, returns a port and an `accept`; fx has no close yet), `pty` reads `pty.spawn`, `sqlite` reads `sqlite.open`, `dns` reads `dns/promises` with `lookup` and `resolve`, and `watch` reads `fs.watch` only, since fx exposes watch as a member of fs. Gaps that remain: `net.tls` (no cert option on serve), the agent rows (`agent.core` and `agent.persistence`, the second still open in fx), and the loader and reload rows. `net.fetch` reads the `fetch` module, and `net.ws` reads the `ws` module's `connect`, which returns send, recv and close.

## What the adapter does

- `planHost(host)` is pure. It requires `version.interface === 1` and a `capabilities` list, and sorts the table into `register` (the host reports the capability), `gaps` (the row is a gap), `absent` (the host does not report it) and `unknown` (a capability the table does not name; reported, never registered). A reported capability whose namespace is missing throws `FxHostContractError`.
- `createHostAdapter(host)` is the Cordis plugin: for each registered row it provides the service and sets a Proxy over the namespace. A plugin that injects a service the host lacks does not run.
- The Proxy reads the namespace on every access, so a replaced namespace shows through. A member outside the row's list, or one the host lacks, throws `FxUnsupported` (`ERR_FX_UNSUPPORTED`). Assignment is refused. Disposing the adapter's fiber removes every service.
- Permission denial, deadlines and tool failures are the host's: the Proxy forwards them untouched.

## Tests

- `node test/adapter.js`: thirteen cases in plain Node against `test/stub-host.js`, which has the live host's shape.
- `node test/fx-table.js`: the tool rows against `test/fixtures/fx-tool-names.json` and the verb map against `test/fixtures/fx-host-verbs.json`, both the tool names are snapshotted from fx's published docs by `scripts/snapshot-fx.mjs`; the verb names are the live binary's (fx's published verb table lists 22 and the host has 46, so the docs are behind).
- `fx js scripts/fx-live-check.mjs`: the real host's shape against the stub, the plan the adapter makes for it, and serve listening on the host. It throws if any check fails.
- `sh scripts/fx-ws-check.sh <fx binary>`: a websocket echo across two `fx js` processes. The server is `scripts/ws-echo-server.mjs` (serve through the adapter, accept, echo one frame on port 47361); the client is `scripts/ws-echo-client.mjs` (net.ws through the adapter: connect, send, read the echo, close).
