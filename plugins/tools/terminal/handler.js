import { spawn } from 'node:child_process'
const _sessions = new Map()

export const _tool = ({
    name: 'terminal',
    toolset: 'core',
    schema: { name: 'terminal', description: 'Open a long-lived shell session, send input lines, capture output. Actions: open, send, read, close.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['open', 'send', 'read', 'close', 'list'] }, id: { type: 'string' }, input: { type: 'string' }, cwd: { type: 'string' } }, required: ['action'] } },
    handler: async ({ action, id, input, cwd }) => {
        if (action === 'open') {
            const sid = 'term-' + Date.now()
            const sh = process.platform === 'win32' ? 'cmd' : 'sh'
            const child = spawn(sh, [], { cwd: cwd || process.cwd(), env: process.env })
            const buf = { stdout: '', stderr: '' }
            child.stdout?.on('data', d => buf.stdout += d.toString())
            child.stderr?.on('data', d => buf.stderr += d.toString())
            _sessions.set(sid, { child, buf })
            return { id: sid, opened: true }
        }
        const s = _sessions.get(id)
        if (!s) return { error: 'unknown terminal id: ' + id }
        if (action === 'send') { s.child.stdin?.write(input + '\n'); return { sent: true } }
        if (action === 'read') { const out = { ...s.buf }; s.buf.stdout = ''; s.buf.stderr = ''; return out }
        if (action === 'close') { try { s.child.kill('SIGTERM') } catch {} _sessions.delete(id); return { closed: id } }
        if (action === 'list') return { sessions: [..._sessions.keys()] }
        return { error: 'unknown action' }
    },
})
