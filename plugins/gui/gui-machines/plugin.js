// Exposes live persisted machine snapshots over HTTP for the dashboard.
// GET /api/machines        -> { count, kinds:{<kind>:n}, machines:[{kind,key,status,state,updated}] }
// GET /api/machines/:kind  -> machines filtered to one kind
// POST /api/machines/resume -> { ok, summary } : drive resumeAll() on demand
import { list } from '../../../src/machines/snapshot-store.js'
import { registerDebug } from '../../../src/observability/debug.js'
import { stateMachinesSnapshot, stateMachinesLiveSnapshot } from '../../../src/observability/state-machines.js'

// window.__debug.machines() / GET /debug/machines — live persisted machine census.
registerDebug('machines', () => ({ note: 'GET /api/machines for live snapshots', kinds: ['agent', 'cron', 'batch', 'gateway', 'gateway-msg', 'acp', 'acp-prompt'] }))

async function snapshotRows(kind = null) {
    const rows = await list({ kind, status: null })
    return rows.map(r => {
        let state = null
        try { const ps = JSON.parse(r.snapshot_json || 'null'); state = ps?.value ?? null } catch {}
        return { kind: r.kind, key: r.key, status: r.status, state, machine_id: r.machine_id, updated: r.updated }
    })
}

export default {
    name: 'gui-machines', surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/machines', async (_req, res) => {
            try {
                // list() does not return snapshot_json (truncated for size); re-read full per row.
                const { db } = await import('../../../src/db.js')
                const d = await db()
                await d.exec(`CREATE TABLE IF NOT EXISTS machine_snapshots (kind TEXT, key TEXT, schema_version INTEGER, machine_id TEXT, snapshot_json TEXT, status TEXT, updated INTEGER, PRIMARY KEY(kind,key))`)
                const all = await d.prepare(`SELECT kind, key, machine_id, snapshot_json, status, updated FROM machine_snapshots ORDER BY updated DESC`).all()
                const kinds = {}
                const machines = all.map(r => {
                    kinds[r.kind] = (kinds[r.kind] || 0) + 1
                    let state = null
                    try { state = JSON.parse(r.snapshot_json || 'null')?.value ?? null } catch {}
                    return { kind: r.kind, key: r.key, status: r.status, state, machine_id: r.machine_id, updated: r.updated }
                })
                res.json({ count: machines.length, kinds, machines })
            } catch (e) { res.status(500).json({ error: String(e.message || e) }) }
        })
        gui.route('GET', '/api/machines/steps/:key', async (req, res) => {
            try { const { listSteps } = await import('../../../src/machines/step-journal.js'); res.json({ key: req.params.key, steps: await listSteps(req.params.key) }) }
            catch (e) { res.status(500).json({ error: String(e.message || e) }) }
        })
        // Real xstate-config-introspected Mermaid stateDiagram-v2 per machine
        // kind (agent/cron/batch/gateway/acp), plus the active persisted
        // snapshot list — see src/observability/state-machines.js. Registered
        // BEFORE the /:kind wildcard param route below — Express matches
        // routes in registration order, so /api/machines/diagrams would
        // otherwise be swallowed by :kind capturing 'diagrams' as a literal
        // value (confirmed live: the swallowed route returned the SPA
        // fallback's index.html instead of JSON before this reordering).
        gui.route('GET', '/api/machines/diagrams', async (_req, res) => {
            try { res.json(await stateMachinesSnapshot()) }
            catch (e) { res.status(500).json({ error: String(e.message || e) }) }
        })
        gui.route('GET', '/api/machines/:kind', async (req, res) => {
            try { res.json({ machines: await snapshotRows(req.params.kind) }) }
            catch (e) { res.status(500).json({ error: String(e.message || e) }) }
        })
        gui.route('POST', '/api/machines/resume', async (_req, res) => {
            try { const { resumeAll } = await import('../../../src/machines/resume.js'); res.json({ ok: true, summary: await resumeAll() }) }
            catch (e) { res.status(500).json({ error: String(e.message || e) }) }
        })
        // Real-time view: one Mermaid diagram per currently-active machine
        // instance with its live current state highlighted (xstate-mermaid-viz's
        // static per-kind diagrams don't know which state is live; this
        // cross-references active persisted snapshots against each kind's
        // diagram). The dashboard's live-page-rerender pattern (AGENTS.md:
        // AppState.body recompute for live routes) is the client-side half —
        // this route is the polled data source, re-fetched on each recompute.
        gui.route('GET', '/debug/state-machines', async (_req, res) => {
            try { res.json(await stateMachinesLiveSnapshot()) }
            catch (e) { res.status(500).json({ error: String(e.message || e) }) }
        })
    },
}
