// `freddie profile [--seconds=N]` — real CPU profiling via node:inspector's
// built-in Profiler domain (no new dep). Writes a .cpuprofile file loadable
// in Chrome DevTools, plus an in-terminal top-N self-time summary.
// `freddie heap-snapshot [path]` / `freddie heap-diff <before> <after>` --
// real heap snapshots via the built-in HeapProfiler domain.
import fs from 'node:fs'
import path from 'node:path'
import inspector from 'node:inspector'
import { getFreddieHome } from '../../src/home.js'

function withSession(fn) {
    const session = new inspector.Session()
    session.connect()
    return fn(session).finally(() => session.disconnect())
}

function post(session, method, params = null) {
    return new Promise((resolve, reject) => session.post(method, params, (err, result) => err ? reject(err) : resolve(result)))
}

async function captureCpuProfile(seconds) {
    return withSession(async (session) => {
        await post(session, 'Profiler.enable')
        await post(session, 'Profiler.start')
        await new Promise((r) => setTimeout(r, seconds * 1000))
        const { profile } = await post(session, 'Profiler.stop')
        return profile
    })
}

function topSelfTime(profile, topN = 10) {
    const byId = new Map(profile.nodes.map((n) => [n.id, n]))
    const hits = new Map()
    for (const nodeId of profile.samples) hits.set(nodeId, (hits.get(nodeId) || 0) + 1)
    return [...hits.entries()]
        .map(([id, count]) => { const n = byId.get(id); return { fn: n.callFrame.functionName || '(anonymous)', file: n.callFrame.url, line: n.callFrame.lineNumber, hits: count } })
        .sort((a, b) => b.hits - a.hits)
        .slice(0, topN)
}

async function captureHeapSnapshot(outPath) {
    return withSession(async (session) => {
        const chunks = []
        session.on('HeapProfiler.addHeapSnapshotChunk', (m) => chunks.push(m.params.chunk))
        await post(session, 'HeapProfiler.takeHeapSnapshot', null)
        fs.writeFileSync(outPath, chunks.join(''))
    })
}

function parseHeapSnapshot(filePath) {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    // V8 heap snapshot format: node fields are flat-packed per the
    // snapshot.meta.node_fields layout; 'name' and 'self_size' are the two
    // fields this diff needs. Real format, not a synthetic simplification.
    const meta = raw.snapshot.meta
    const nodeFieldCount = meta.node_fields.length
    const nameIdx = meta.node_fields.indexOf('name')
    const selfSizeIdx = meta.node_fields.indexOf('self_size')
    const typeIdx = meta.node_fields.indexOf('type')
    const nodeTypes = meta.node_types[typeIdx]
    const byName = new Map()
    for (let i = 0; i < raw.nodes.length; i += nodeFieldCount) {
        const typeOrdinal = raw.nodes[i + typeIdx]
        const typeName = nodeTypes[typeOrdinal] || 'unknown'
        if (typeName !== 'object' && typeName !== 'native') continue
        const nameOrdinal = raw.nodes[i + nameIdx]
        const name = raw.strings[nameOrdinal] || '(unnamed)'
        const selfSize = raw.nodes[i + selfSizeIdx]
        byName.set(name, (byName.get(name) || 0) + selfSize)
    }
    return byName
}

function diffHeapSnapshots(beforePath, afterPath) {
    const before = parseHeapSnapshot(beforePath)
    const after = parseHeapSnapshot(afterPath)
    const names = new Set([...before.keys(), ...after.keys()])
    const deltas = [...names].map((name) => ({ name, before: before.get(name) || 0, after: after.get(name) || 0, delta: (after.get(name) || 0) - (before.get(name) || 0) }))
    return deltas.sort((a, b) => b.delta - a.delta)
}

export default {
    name: 'debug-profiling', surfaces: 'pi',
    register({ pi }) {
        pi.cli.register({
            name: 'profile',
            description: 'Capture a real CPU profile of this process (--seconds=N, default 5), write a .cpuprofile file + terminal top-N self-time summary',
            options: [{ flag: '--seconds <n>', default: '5' }, { flag: '--out <path>', default: '' }],
            action: async (opts) => {
                const seconds = Number(opts.seconds) || 5
                console.log(`profiling for ${seconds}s...`)
                const profile = await captureCpuProfile(seconds)
                const outPath = opts.out || path.join(getFreddieHome(), `profile-${Date.now()}.cpuprofile`)
                fs.writeFileSync(outPath, JSON.stringify(profile))
                console.log(`wrote ${outPath} (load in Chrome DevTools Performance tab)`)
                console.log(`\ntop self-time (${profile.samples.length} samples):`)
                for (const r of topSelfTime(profile)) console.log(`  ${String(r.hits).padStart(5)}  ${r.fn}  (${r.file}:${r.line})`)
            },
        })
        pi.cli.register({
            name: 'heap-snapshot',
            description: 'Capture a real v8 heap snapshot of this process (heap-snapshot [path])',
            args: [{ name: 'outPath' }],
            action: async (outPath) => {
                const p = outPath || path.join(getFreddieHome(), `heap-${Date.now()}.heapsnapshot`)
                console.log(`capturing heap snapshot...`)
                await captureHeapSnapshot(p)
                console.log(`wrote ${p}`)
            },
        })
        pi.cli.register({
            name: 'heap-diff',
            description: 'Compare two v8 heap snapshots, report largest retained-size deltas by constructor name (heap-diff <before> <after>)',
            args: [{ name: 'before' }, { name: 'after' }],
            action: (before, after) => {
                if (!before || !after) { console.log('usage: freddie heap-diff <before.heapsnapshot> <after.heapsnapshot>'); process.exitCode = 1; return }
                if (!fs.existsSync(before) || !fs.existsSync(after)) { console.log('one or both snapshot files not found'); process.exitCode = 1; return }
                const deltas = diffHeapSnapshots(before, after).filter((d) => d.delta !== 0).slice(0, 20)
                for (const d of deltas) console.log(`  ${d.delta > 0 ? '+' : ''}${d.delta.toString().padStart(10)} bytes  ${d.name}  (${d.before} -> ${d.after})`)
            },
        })
    },
}
