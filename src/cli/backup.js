import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../home.js'
export async function createBackup({ outFile } = {}) {
    const home = getFreddieHome()
    const out = outFile || path.join(home, 'backups', 'freddie-' + new Date().toISOString().replace(/[:.]/g, '-') + '.tar.gz')
    fs.mkdirSync(path.dirname(out), { recursive: true })
    const { spawnSync } = await import('node:child_process')
    const r = spawnSync('tar', ['-czf', out, '-C', path.dirname(home), path.basename(home)], { encoding: 'utf8' })
    if (r.status === 0) return { ok: true, file: out, size: fs.statSync(out).size }
    return { ok: false, stderr: r.stderr, hint: 'tar may be missing on Windows; install GNU tar or use a different archiver.' }
}
export function listBackups() {
    const dir = path.join(getFreddieHome(), 'backups')
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir).filter(f => f.endsWith('.tar.gz')).map(f => ({ name: f, file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
}
