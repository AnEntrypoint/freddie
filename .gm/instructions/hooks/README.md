# gm jit hooks

`storage-vector-example.js` is a real, live-verified jit-hook demonstrating gm and deepseek-harness sharing plugkit storage — the concrete proof, not just documentation, that `packages/storage/storage-sqlite` (this repo's libsql-plugkit-client-backed `ctx.storage` backend) is reachable directly from a gm FSM gate condition.

## What a jit hook is

A plain `exec_js` script gm's orchestrator runs automatically at a gate's evaluation, wrapped in an async function body. `return true` passes the gate; anything else (`false`, a thrown error, a non-boolean return, a missing `return`, a missing/unreadable file) fails CLOSED, never open. Wired into a gate via a `GateDef`'s `hook` field (a path relative to this directory) and `hook_mode` (`hook-only` to replace the compiled predicate entirely, `both` to require both, or the default `predicate-only` which ignores the file) in a vendored `.gm/instructions/fsm/graph.json`.

**This file alone changes nothing** — no gate currently names it, and no FSM graph is vendored in this project. Wiring a gate to reference it, or vendoring a graph at all, is a separate, deliberate one-way-door decision (gm's own Section 4: ask before reconfiguring; state which gates a vendored graph drops) — never taken silently by adding an example file here.

## What `storage-vector-example.js` proves

Live-verified this session, both through a direct Node simulation and through the real `exec_js` dispatch path against the shared daemon:

- Opens `packages/storage/storage-sqlite`'s `SqliteStorageBackend` directly (via `require()` — Node 22+'s native `require(esm)` interop loads the ESM module synchronously, verified live).
- Checks a real record (`approvals.ship`) in a real libsql-plugkit-client-backed database at `.gm/gate-approvals.db`.
- Denies (`false`) until that record is set `true`, exactly the same gate shape as the stock `.gm/ship-approved`-file-existence example, but against genuinely shared DB storage instead of a bare file.

To set the approval this hook checks for, from any Node context in this repo:

```js
import { SqliteStorageBackend } from './packages/storage/storage-sqlite/src/index.js'
const backend = new SqliteStorageBackend('.gm/gate-approvals.db')
const unit = await backend.kv.open({ name: 'gm_gate_approvals', version: 1, tables: ['approvals'], hasGlobal: false })
await unit.putRecord('approvals', 'ship', true)
await unit.close()
await backend.close()
```
