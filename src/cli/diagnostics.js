import fs from 'node:fs'
import path from 'node:path'
import { listDebug, snapshot, snapshotAll } from '../observability/debug.js'
import { env } from '../env.js'
import { getFreddieHome } from '../home.js'
import { listSessions, getMessages } from '../sessions.js'
import { loadConfig } from '../config.js'

// --- debug: verbose-mode toggle + in-memory subsystem snapshots -----------
let _verbose = Boolean(env('FREDDIE_DEBUG'))
export function isVerbose() { return _verbose }
export function setVerbose(v) { _verbose = Boolean(v); process.env.FREDDIE_DEBUG = v ? '1' : '' }
export function dprint(...args) { if (_verbose) console.error('[debug]', ...args) }
export function dumpDebug(name) { return name ? snapshot(name) : { subsystems: listDebug(), all: snapshotAll() } }

// --- dump: full state export (sessions + config) --------------------------
export async function dumpAll(outFile = null) {
    const sessions = await listSessions(1000)
    const enriched = await Promise.all(sessions.map(async s => ({ ...s, messages: await getMessages(s.id) })))
    const out = { ts: Date.now(), freddie_home: getFreddieHome(), config: loadConfig(), sessions: enriched }
    const json = JSON.stringify(out, null, 2)
    if (outFile) { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, json, 'utf8'); return { written: outFile, bytes: json.length } }
    return out
}

// --- logs: on-disk log file listing/tailing/following ----------------------
export function listLogFiles() {
    const dir = path.join(getFreddieHome(), 'logs')
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir).filter(f => f.endsWith('.log')).map(f => f.replace(/\.log$/, ''))
}
export function tail(subsystem, { max = 100, level = null } = {}) {
    const file = path.join(getFreddieHome(), 'logs', subsystem + '.log')
    if (!fs.existsSync(file)) return []
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
    let parsed = lines.map(l => { try { return JSON.parse(l) } catch { return { raw: l } } })
    if (level) { const SEV = { debug: 10, info: 20, warning: 30, error: 40 }; const min = SEV[level] || 20; parsed = parsed.filter(r => (SEV[r.severity] || 0) >= min) }
    return parsed.slice(-max)
}
export async function followLog(subsystem, onLine) {
    const file = path.join(getFreddieHome(), 'logs', subsystem + '.log')
    let pos = fs.existsSync(file) ? fs.statSync(file).size : 0
    const watcher = fs.watch(path.dirname(file), (_, name) => {
        if (name !== subsystem + '.log') return
        const stat = fs.statSync(file)
        if (stat.size <= pos) { pos = 0; return }
        const buf = Buffer.alloc(stat.size - pos)
        const fd = fs.openSync(file, 'r')
        fs.readSync(fd, buf, 0, buf.length, pos)
        fs.closeSync(fd)
        pos = stat.size
        for (const l of buf.toString('utf8').split('\n').filter(Boolean)) try { onLine(JSON.parse(l)) } catch { onLine({ raw: l }) }
    })
    return () => watcher.close()
}

// --- plugins: surfaces the host's failed[] plugin-boot-failure list --------
// host.failed() (src/host/host.js) records { name, error, ts } for every
// plugin whose register() threw during boot, so a degraded boot (some
// plugins silently missing) is visible instead of only inferable from a
// smaller-than-expected `freddie tools`/`freddie skills` listing.
export function listFailedPlugins(host) {
    return typeof host?.failed === 'function' ? host.failed() : []
}

// --- command registration: `freddie diagnostics debug|dump|logs|plugins` --
export function registerDiagnosticsCommand(C, host) {
    C({
        name: 'diagnostics',
        description: 'debug/dump/logs + failed-plugin visibility (debug [name] | dump [file] | logs [subsystem] [level] | plugins)',
        args: [{ name: 'action', default: 'plugins' }, { name: 'a1' }, { name: 'a2' }],
        action: async (action, a1, a2) => {
            if (action === 'debug') { console.log(JSON.stringify(dumpDebug(a1), null, 2)); return }
            if (action === 'dump') { const r = await dumpAll(a1 || null); console.log(a1 ? JSON.stringify(r) : JSON.stringify(r, null, 2)); return }
            if (action === 'logs') {
                if (!a1) { for (const f of listLogFiles()) console.log(f); return }
                for (const row of tail(a1, { level: a2 || null })) console.log(JSON.stringify(row))
                return
            }
            if (action === 'plugins') {
                const failures = listFailedPlugins(host)
                if (!failures.length) { console.log('no failed plugins'); return }
                for (const f of failures) console.log(`[fail] ${f.name}\t${new Date(f.ts).toISOString()}\t${f.error}`)
                return
            }
            console.error('usage: freddie diagnostics [debug [name]|dump [file]|logs [subsystem] [level]|plugins]')
            process.exitCode = 1
        },
    })
}
