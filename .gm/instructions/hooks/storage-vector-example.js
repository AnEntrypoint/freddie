// Example FSM jit-hook demonstrating shared plugkit storage from within a
// gate: this repo's own packages/storage/storage-sqlite (a real
// libsql-plugkit-client-backed ctx.storage backend, live-verified this
// session) checked directly from a gm gate condition -- the concrete proof
// that gm and deepseek-harness genuinely share one storage layer, not just
// documentation claiming they do.
//
// Wired into a gate via a GateDef's `hook` field (path relative to this
// hooks/ dir) and `hook_mode` ("hook-only" or "both") in a project's
// .gm/instructions/fsm/graph.json -- this file alone changes nothing until
// a gate actually names it; vendoring the graph wholesale is a separate,
// deliberate decision (gm's own Section 4: a one-way door, ask first) not
// taken by adding this file.
//
// Same contract as every jit-hook: wrapped in an async function body,
// EXPLICIT `return` required (a bare trailing expression is discarded, not
// an implicit return), `true` passes the gate, anything else -- false, a
// thrown error, a non-boolean return, a missing `return`, a missing/
// unreadable file -- fails CLOSED.
//
// This example's condition: deny until a real record exists in this
// project's own libsql-backed storage under unit "gm_gate_approvals",
// table "approvals", key "ship" -- the plugkit-storage equivalent of the
// stock example's `.gm/ship-approved` file-existence check, proving the
// same gate shape works against genuinely shared DB storage instead of a
// bare file.
const path = require('path')
const { SqliteStorageBackend } = require(
  path.join(process.cwd(), 'packages', 'storage', 'storage-sqlite', 'src', 'index.js'),
)

const backend = new SqliteStorageBackend(path.join(process.cwd(), '.gm', 'gate-approvals.db'))
const unit = await backend.kv.open({ name: 'gm_gate_approvals', version: 1, tables: ['approvals'], hasGlobal: false })
try {
  const { tables } = await unit.loadAll()
  return tables.approvals.ship === true
} finally {
  await unit.close()
  await backend.close()
}
