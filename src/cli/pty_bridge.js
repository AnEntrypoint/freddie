import { spawn } from 'node:child_process'
import { randomId } from '../utils.js'
import { env as getEnv } from '../env.js'
const _ptys = new Map()
export function openPty({ shell = process.platform === 'win32' ? 'cmd' : getEnv('SHELL') || 'sh', cwd = process.cwd(), env = process.env } = {}) {
    const id = 'pty-' + Date.now() + '-' + randomId(3)
    const child = spawn(shell, [], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
    const buf = { stdout: '', stderr: '' }
    child.stdout?.on('data', d => buf.stdout += d.toString())
    child.stderr?.on('data', d => buf.stderr += d.toString())
    _ptys.set(id, { child, buf })
    child.on('exit', () => _ptys.delete(id))
    return id
}
export function ptyWrite(id, data) { const p = _ptys.get(id); if (!p) return { error: 'unknown' }; p.child.stdin?.write(data); return { ok: true } }
export function ptyRead(id) { const p = _ptys.get(id); if (!p) return { error: 'unknown' }; const out = { ...p.buf }; p.buf.stdout = ''; p.buf.stderr = ''; return out }
export function ptyClose(id) { const p = _ptys.get(id); if (!p) return { error: 'unknown' }; try { p.child.kill('SIGTERM') } catch {}; _ptys.delete(id); return { closed: id } }
export function ptyList() { return [..._ptys.keys()] }
