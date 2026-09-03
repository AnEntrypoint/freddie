import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { telemetry } from '../../../../src/observability/telemetry.js'

const _clients = new Map()

export const mcpTool = ({
    name: 'mcp_tool',
    toolset: 'core',
    schema: { name: 'mcp_tool', description: 'Connect to an external MCP server (stdio) and call its tools.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['connect', 'list', 'call', 'disconnect'] }, id: { type: 'string' }, command: { type: 'string' }, args: { type: 'array' }, name: { type: 'string' }, arguments: {} }, required: ['action'] } },
    handler: async ({ action, id, command, args = [], name, arguments: callArgs = {} }) => {
        if (action === 'connect') {
            const r = await connectMcpServer({ command, args, id })
            if (r.error) return { error: r.error }
            return { id: r.id }
        }
        const c = _clients.get(id)
        if (!c) {
            // Lazily connect a declared server if a `call` arrives without the
            // session-start auto-connect having run (e.g. a tool call issued
            // outside a normal runTurn). Dynamic import avoids a static cycle
            // with auto-connect.js (which imports this module).
            try {
                const { discoverMcpServers, autoConnectMcpServers } = await import('./auto-connect.js')
                const declared = discoverMcpServers().find((s) => s.id === id)
                if (declared && (await autoConnectMcpServers())) {
                    const cc = _clients.get(id)
                    if (cc) return await cc.client.callTool({ name, arguments: callArgs })
                }
            } catch {}
            return { error: 'unknown id' }
        }
        if (action === 'list') return await c.client.listTools()
        if (action === 'call') return await c.client.callTool({ name, arguments: callArgs })
        if (action === 'disconnect') { try { await c.client.close() } catch {} _clients.delete(id); return { ok: true } }
        return { error: 'unknown action' }
    },
})

export function getClients() {
    return [..._clients.entries()].map(([id, c]) => ({
        id,
        command: c.command,
        args: c.args || [],
        connectedAt: c.connectedAt,
        status: 'connected',
    }))
}

/**
 * True when a client with the given id is currently registered. The map only
 * holds live connections (entries are removed on explicit disconnect), so a
 * present id means the stdio transport is still up.
 */
export function isMcpConnected(id) {
    return _clients.has(id)
}

/**
 * Connect to an MCP server over stdio. Shared by the `mcp_tool` `connect`
 * action and any auto-boot wiring (e.g. gm-mcp). Returns { id } on success or
 * { error } on failure; never throws.
 */
export async function connectMcpServer({ command, args = [], id } = {}) {
    if (!command) return { error: 'command required' }
    const cid = id || 'mcp-' + Date.now()
    const transport = new StdioClientTransport({ command, args })
    const client = new Client({ name: 'freddie', version: '1.0.0' }, { capabilities: {} })
    try {
        await client.connect(transport)
    } catch (err) {
        telemetry.mcpFailed({ id: cid, command, error: err?.message || String(err) })
        return { error: err?.message || String(err) }
    }
    transport.onerror = (err) => { telemetry.mcpFailed({ id: cid, command, error: err?.message || String(err) }) }
    transport.onclose = () => { telemetry.mcpFailed({ id: cid, command, exit_code: null }) }
    _clients.set(cid, { client, transport, command, args, connectedAt: Date.now() })
    telemetry.mcpConnected({ id: cid, command, args })
    return { id: cid }
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