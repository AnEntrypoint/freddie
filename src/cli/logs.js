import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../home.js'
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
