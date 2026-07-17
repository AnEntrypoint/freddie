import { spawn } from 'node:child_process'

const _clients = new Map()

export const mcpTool = ({
    name: 'mcp_tool',
    toolset: 'core',
    schema: { name: 'mcp_tool', description: 'Connect to an external MCP server (stdio) and call its tools.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['connect', 'list', 'call', 'disconnect'] }, id: { type: 'string' }, command: { type: 'string' }, args: { type: 'array' }, name: { type: 'string' }, arguments: {} }, required: ['action'] } },
    handler: async ({ action, id, command, args = [], name, arguments: callArgs = {} }) => {
        if (action === 'connect') {
            const cid = id || 'mcp-' + Date.now()
            const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] })
            _clients.set(cid, { child, nextId: 1, pending: new Map(), buf: '' })
            const c = _clients.get(cid)
            child.stdout.on('data', d => {
                c.buf += d.toString()
                const lines = c.buf.split('\n'); c.buf = lines.pop()
                for (const l of lines) { try { const m = JSON.parse(l); const p = c.pending.get(m.id); if (p) { c.pending.delete(m.id); p.resolve(m) } } catch {} }
            })
            return { id: cid, connected: true }
        }
        const c = _clients.get(id)
        if (!c) return { error: 'unknown id' }
        const rpc = (method, params) => new Promise((resolve, reject) => {
            const rid = c.nextId++
            c.pending.set(rid, { resolve, reject })
            c.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: rid, method, params }) + '\n')
            setTimeout(() => { if (c.pending.has(rid)) { c.pending.delete(rid); reject(new Error('mcp timeout')) } }, 30000)
        })
        if (action === 'list') return await rpc('tools/list', {})
        if (action === 'call') return await rpc('tools/call', { name, arguments: callArgs })
        if (action === 'disconnect') { try { c.child.kill('SIGTERM') } catch {} _clients.delete(id); return { disconnected: id } }
        return { error: 'unknown action' }
    },
})
