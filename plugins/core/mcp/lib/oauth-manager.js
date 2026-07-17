import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../../../../src/home.js'

function tokFile(server) { return path.join(getFreddieHome(), 'mcp-tokens', encodeURIComponent(server) + '.json') }

export const mcpOauthManagerTool = ({
    name: 'mcp_oauth_manager',
    toolset: 'core',
    schema: { name: 'mcp_oauth_manager', description: 'Persist & retrieve MCP OAuth tokens. Actions: store, get, list, delete, refresh.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['store', 'get', 'list', 'delete'] }, server: { type: 'string' }, token: {} }, required: ['action'] } },
    handler: async ({ action, server, token }) => {
        const dir = path.join(getFreddieHome(), 'mcp-tokens'); fs.mkdirSync(dir, { recursive: true })
        if (action === 'store') { fs.writeFileSync(tokFile(server), JSON.stringify({ server, token, ts: Date.now() }), { mode: 0o600 }); return { stored: server } }
        if (action === 'get') { const f = tokFile(server); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { error: 'not found' } }
        if (action === 'list') return { servers: fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => decodeURIComponent(f.replace(/\.json$/, ''))) }
        if (action === 'delete') { const f = tokFile(server); if (fs.existsSync(f)) fs.unlinkSync(f); return { deleted: server } }
        return { error: 'unknown action' }
    },
})
