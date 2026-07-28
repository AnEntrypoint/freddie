import { spawn } from 'node:child_process'
import { telemetry } from '../../../../src/observability/telemetry.js'

const _clients = new Map()

export const mcpTool = ({
    name: 'mcp_tool',
    toolset: 'core',
    schema: { name: 'mcp_tool', description: 'Connect to an external MCP server (stdio) and call its tools.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['connect', 'list', 'call', 'disconnect'] }, id: { type: 'string' }, command: { type: 'string' }, args: { type: 'array' }, name: { type: 'string' }, arguments: {} }, required: ['action'] } },
    handler: async ({ action, id, command, args = [], name, arguments: callArgs = {} }) => {
        if (action === 'connect') {
            const cid = id || 'mcp-' + Date.now()
            const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] })
            child.on('error', (err) => {
                telemetry.mcpFailed({ id: cid, command, error: err?.message || String(err) })
            })
            child.on('exit', (code) => {
                if (code !== 0 && code !== null) {
                    telemetry.mcpFailed({ id: cid, command, exit_code: code })
                }
            })
            _clients.set(cid, { child, nextId: 1, pending: new Map(), buf: '' })
            const c = _clients.get(cid)
            telemetry.mcpConnected({ id: cid, command, args })
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

export function getClients() {
    return [..._clients.values()].map(c => ({
        id: c.id,
        command: c.command,
        args: c.args || [],
        connectedAt: c.connectedAt,
        status: c.status || 'connected',
        tools: c.tools || null,
        error: c.error || null,
    }))
}

/**
 * Resolve OAuth bearer token headers for an MCP server connection.
 * For HTTP-based MCP transports (Streamable HTTP), call this before connecting
 * to include the Authorization header. Returns null if no token is stored.
 * @param {string} serverName
 * @param {{ tokenUrl?: string, clientId?: string, clientSecret?: string }} [opts]
 * @returns {Promise<{Authorization: string}|null>}
 */
export async function resolveOAuthHeaders(serverName, { tokenUrl, clientId, clientSecret } = {}) {
    try {
        const { getMcpOAuthManager } = await import('./oauth-manager.js')
        const mgr = getMcpOAuthManager()
        const accessToken = await mgr.ensureFresh(serverName, { tokenUrl, clientId, clientSecret })
        if (accessToken) {
            return { Authorization: `Bearer ${accessToken}` }
        }
    } catch { /* OAuth manager not available (browser env, etc.) */ }
    return null
}