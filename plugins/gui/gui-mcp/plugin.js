/**
 * gui-mcp — Dashboard routes for MCP server management.
 *
 * Routes:
 *   GET /api/mcp/health          — overall MCP subsystem health check
 *   GET /api/mcp/tools           — list all tools with server attribution
 *   GET /api/mcp/servers         — list server statuses (connected/disconnected/error)
 *   POST /api/mcp/reconnect/:id  — reconnect a disconnected server
 *   GET /api/mcp/oauth           — list MCP servers with stored OAuth tokens
 *   POST /api/mcp/oauth/:server  — store an OAuth token for a server
 *   DELETE /api/mcp/oauth/:server — remove an OAuth token for a server
 *
 * Browser-compatible: this module only registers Express routes; it has no
 * DOM / browser-specific code. The dashboard SDK consumes the JSON endpoints.
 */
import { getClients } from '../../core/mcp/lib/tool.js'

export default {
    name: 'gui-mcp',
    surfaces: 'gui',
    // Statically imports from and (in route handlers below) dynamically
    // imports plugins/core/mcp's lib/tool.js + lib/oauth-manager.js -- this
    // requires entry makes that real coupling visible to gui-plugin-graph's
    // dependency visualization (which reads ONLY the requires array, not
    // static/dynamic imports) and enforces load-order/presence via topoSort.
    requires: ['mcp'],
    register({ gui }) {
        // Health check — returns ok + connected server count
        gui.route('GET', '/api/mcp/health', (_req, res) => {
            const clients = getClients()
            const connected = clients.filter(c => c.status === 'connected').length
            const errored = clients.filter(c => c.status === 'error').length
            res.json({
                ok: true,
                totalServers: clients.length,
                connected,
                errored,
                servers: clients.map(c => ({
                    id: c.id,
                    command: c.command,
                    status: c.status,
                    toolCount: c.tools ? c.tools.length : null,
                    error: c.error || null,
                })),
            })
        })

        // Tool listing with server attribution
        gui.route('GET', '/api/mcp/tools', (_req, res) => {
            const clients = getClients()
            const tools = []
            for (const c of clients) {
                if (c.tools) {
                    for (const t of c.tools) {
                        tools.push({
                            name: t.name,
                            description: t.description || '',
                            server: c.id,
                            serverCommand: c.command,
                            serverStatus: c.status,
                            inputSchema: t.inputSchema || null,
                        })
                    }
                }
            }
            res.json({ tools, total: tools.length })
        })

        // Server status listing
        gui.route('GET', '/api/mcp/servers', (_req, res) => {
            const clients = getClients()
            res.json({
                servers: clients.map(c => ({
                    id: c.id,
                    command: c.command,
                    args: c.args || [],
                    connectedAt: c.connectedAt,
                    status: c.status,
                    toolCount: c.tools ? c.tools.length : null,
                    tools: c.tools ? c.tools.map(t => ({ name: t.name, description: t.description || '' })) : null,
                    error: c.error || null,
                })),
            })
        })

        // OAuth token management
        gui.route('GET', '/api/mcp/oauth', async (_req, res) => {
            try {
                const { getMcpOAuthManager } = await import('../core/mcp/lib/oauth-manager.js')
                const mgr = getMcpOAuthManager()
                const servers = await mgr.listServers()
                res.json({ servers })
            } catch (e) {
                res.status(500).json({ error: e.message })
            }
        })

        gui.route('POST', '/api/mcp/oauth/:server', async (req, res) => {
            const { server } = req.params
            if (!server) return res.status(400).json({ error: 'server name is required' })
            const { accessToken, refreshToken, expiresAt, tokenType } = req.body || {}
            if (!accessToken) return res.status(400).json({ error: 'accessToken is required' })
            try {
                const { getMcpOAuthManager } = await import('../core/mcp/lib/oauth-manager.js')
                const mgr = getMcpOAuthManager()
                await mgr.storeToken(server, { accessToken, refreshToken, expiresAt: expiresAt ? expiresAt * 1000 : null, tokenType })
                res.json({ stored: server })
            } catch (e) {
                res.status(500).json({ error: e.message })
            }
        })

        gui.route('DELETE', '/api/mcp/oauth/:server', async (req, res) => {
            const { server } = req.params
            if (!server) return res.status(400).json({ error: 'server name is required' })
            try {
                const { getMcpOAuthManager } = await import('../core/mcp/lib/oauth-manager.js')
                const mgr = getMcpOAuthManager()
                await mgr.removeToken(server)
                res.json({ deleted: server })
            } catch (e) {
                res.status(500).json({ error: e.message })
            }
        })

        // Reconnect a server by id
        gui.route('POST', '/api/mcp/reconnect/:id', async (req, res) => {
            const { id } = req.params
            if (!id) return res.status(400).json({ error: 'id is required' })
            // Dynamic import of the mcp_tool handler to call reconnect
            try {
                const { mcpTool } = await import('../core/mcp/lib/tool.js')
                const result = await mcpTool.handler({ action: 'reconnect', id })
                res.json(result)
            } catch (e) {
                res.status(500).json({ error: e.message })
            }
        })
    },
}