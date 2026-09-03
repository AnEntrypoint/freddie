import { registerDebug } from '../observability/debug.js'

const RING = 20
const runs = []

function recordFlowRun(entry) {
    const rec = {
        name: String(entry?.name || ''),
        ok: !!entry?.ok,
        error: entry?.error ? String(entry.error).slice(0, 240) : null,
        moves: Number(entry?.moves) || 0,
        path: Array.isArray(entry?.path) ? entry.path.map(String) : [],
        filledKeys: Array.isArray(entry?.filledKeys)
            ? entry.filledKeys.map(String)
            : Object.keys(entry?.filled || {}),
        ts: Date.now(),
    }
    runs.push(rec)
    if (runs.length > RING) runs.shift()
    return rec
}

function snapshotFlow() {
    return { runs: runs.slice(), last: runs[runs.length - 1] || null }
}

let _registered = false
function ensureFlowDebug() {
    if (_registered) return
    _registered = true
    try { registerDebug('flow', snapshotFlow) } catch { }
}

ensureFlowDebug()

export { recordFlowRun, snapshotFlow, ensureFlowDebug }
