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

## What the adapter does

- `planHost(host)` is pure. It requires `version.interface === 1` and a `capabilities` list, and sorts the table into `register` (the host reports the capability), `gaps` (the row is a gap), `absent` (the host does not report it) and `unknown` (a capability the table does not name; reported, never registered). A reported capability whose namespace is missing throws `FxHostContractError`.
- `createHostAdapter(host)` is the Cordis plugin: for each registered row it provides the service and sets a Proxy over the namespace. A plugin that injects a service the host lacks does not run.
- The Proxy reads the namespace on every access, so a replaced namespace shows through. A member outside the row's list, or one the host lacks, throws `FxUnsupported` (`ERR_FX_UNSUPPORTED`). Assignment is refused. Disposing the adapter's fiber removes every service.
- Permission denial, deadlines and tool failures are the host's: the Proxy forwards them untouched.

## Tests

- `node test/adapter.js`: eleven cases in plain Node against `test/stub-host.js`, which has the live host's shape.
- `node test/fx-table.js`: the tool rows against `test/fixtures/fx-tool-names.json` and the verb map against `test/fixtures/fx-host-verbs.json`, both snapshotted from fx's published docs by `scripts/snapshot-fx.mjs`.
- `fx run-code --file scripts/fx-live-check.mjs` (run in the fx checkout's binary): the real host's shape against the stub, and the plan the adapter makes for it. It throws if any check fails.
