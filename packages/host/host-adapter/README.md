# @freddie/freddie-host-adapter

The generic adapter between freddie's Cordis plugins and the `fx:host` module of the host interface. It reads the host's capability table and registers one Cordis service for each capability the host reports present, so a native capability reaches freddie's code without a per-capability package.

```js
import host from 'fx:host'
import { createHostAdapter } from '@freddie/freddie-host-adapter'

ctx.plugin(createHostAdapter(host))
```

## The table

`src/services.js` is the one table. A row is keyed by capability id (`fs`, `watch`, `proc`, `tools.file`, `net.fetch` and the rest of the ids in the host interface's `CapabilityId`) and gives the service name (`hostFs`, `hostWatch`, `hostFileTools`), the host namespace it reads, the members it exposes (`null` means all) and whether the namespace is callable. The `tools.*` rows partition the `tools` namespace, so each tool belongs to exactly one service. `net.tls` and `net.ws` are flags with no namespace and no service.

## What the adapter does

- `planHost(host)` is pure. It requires `host.version.interface === 1` and sorts the table into `register` (reported present), `flags`, `absent` (not reported or `present: false`) and, from the host side, `unknown` (an id the table lacks; reported, never registered). A capability reported present without its namespace throws `FxHostContractError`.
- `createHostAdapter(host)` is the Cordis plugin: for each planned row it provides the service and sets a Proxy over the namespace. A plugin that injects a service the host lacks therefore does not run.
- The Proxy reads the namespace from the host on every access, so a replaced namespace shows through. A member outside the row's member list, or one the host does not have, throws `FxUnsupported` (`ERR_FX_UNSUPPORTED`). Functions are bound to their namespace. Disposing the adapter's fiber removes every service.
- Permission denial, deadlines and tool failures are the host's: the Proxy forwards them untouched.

## Test

`node test/adapter.js` runs eleven cases in plain Node against `test/stub-host.js`, a host with the shape of `docs/host-interface.d.ts` (all capability ids, the full tool list, every namespace). `stubHost({ omit })` removes capabilities and their namespaces.
