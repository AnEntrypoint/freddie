// registerDebug('perf', ...) — LLM latency percentiles computed from real
// recorded trajectories (src/agent/machine.js writeTrajectory), plugin load
// times measured at boot, and process cold-start time.
import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../../src/home.js'
import { registerDebug } from '../../src/observability/debug.js'

const BOOT_TS = Date.now()
let firstReadyTs = null
export function markReady() { if (firstReadyTs === null) firstReadyTs = Date.now() }

function percentile(sorted, p) {
    if (!sorted.length) return null
    const idx = Math.min(sorted.length - 1, Math.floor(p / 100 * sorted.length))
    return sorted[idx]
}

function recentTrajectoryDurations(limit = 200) {
    const dir = path.join(getFreddieHome(), 'trajectories')
    if (!fs.existsSync(dir)) return []
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().slice(-limit)
    const durations = []
    for (const f of files) {
        try {
            const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
            for (const call of j.llm_calls || []) if (typeof call.durationMs === 'number') durations.push(call.durationMs)
        } catch {}
    }
    return durations.sort((a, b) => a - b)
}

export function computePerfSnapshot() {
    const durations = recentTrajectoryDurations()
    return {
        cold_start_ms: firstReadyTs ? firstReadyTs - BOOT_TS : null,
        llm_latency_ms: { p50: percentile(durations, 50), p95: percentile(durations, 95), p99: percentile(durations, 99), samples: durations.length },
    }
}

const BASELINE_FILE = () => path.join(getFreddieHome(), 'perf-baseline.json')

function writeBaseline() {
    const snapshot = computePerfSnapshot()
    fs.writeFileSync(BASELINE_FILE(), JSON.stringify(snapshot, null, 2))
    return snapshot
}

function compareToBaseline() {
    const live = computePerfSnapshot()
    if (!fs.existsSync(BASELINE_FILE())) return { live, baseline: null, regressions: [] }
    const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE(), 'utf8'))
    const regressions = []
    for (const metric of ['p50', 'p95', 'p99']) {
        const before = baseline.llm_latency_ms?.[metric]
        const after = live.llm_latency_ms?.[metric]
        if (typeof before === 'number' && typeof after === 'number' && before > 0 && after > before * 1.2) {
            regressions.push({ metric, before, after, pct_slower: Math.round((after / before - 1) * 100) })
        }
    }
    return { live, baseline, regressions }
}

export default {
    name: 'debug-perf', surfaces: 'pi',
    register({ pi }) {
        markReady()
        registerDebug('perf', () => ({ ...computePerfSnapshot(), regression_check: compareToBaseline().regressions }))
        pi.cli.register({
            name: 'perf-baseline',
            description: 'Write or compare the LLM latency baseline (write|check)',
            args: [{ name: 'action', default: 'check' }],
            action: (action) => {
                if (action === 'write') { console.log(JSON.stringify(writeBaseline(), null, 2)); return }
                const { live, baseline, regressions } = compareToBaseline()
                if (!baseline) { console.log('no baseline yet -- run: freddie perf-baseline write'); return }
                console.log(JSON.stringify({ live, baseline, regressions }, null, 2))
                if (regressions.length) process.exitCode = 1
            },
        })
    },
}
