import { McpOAuthManager } from './oauth.js'
import { getAuthStore } from '../../../../src/auth.js'

let _manager = null
export function getMcpOAuthManager() {
    if (!_manager) _manager = new McpOAuthManager({ authStore: getAuthStore() })
    return _manager
}

export const mcpOauthManagerTool = ({
    name: 'mcp_oauth_manager',
    toolset: 'core',
    schema: { name: 'mcp_oauth_manager', description: 'Persist & retrieve MCP OAuth tokens. Actions: store, get, list, delete, refresh.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['store', 'get', 'list', 'delete', 'refresh'] }, server: { type: 'string' }, token: {}, tokenUrl: { type: 'string' }, clientId: { type: 'string' }, clientSecret: { type: 'string' } }, required: ['action'] } },
    handler: async ({ action, server, token, tokenUrl, clientId, clientSecret }) => {
        const mgr = getMcpOAuthManager()
        if (action === 'store') {
            if (!server || !token) return { error: 'server and token are required' }
            await mgr.storeToken(server, { accessToken: token.access_token || token, refreshToken: token.refresh_token, expiresAt: token.expires_at ? (typeof token.expires_at === 'number' ? token.expires_at : token.expires_at * 1000) : null, tokenType: token.token_type || 'Bearer' })
            return { stored: server }
        }
        if (action === 'get') {
            if (!server) return { error: 'server is required' }
            const t = await mgr.getToken(server)
            return t ? { server, token: t } : { error: 'not found' }
        }
        if (action === 'list') {
            return { servers: await mgr.listServers() }
        }
        if (action === 'delete') {
            if (!server) return { error: 'server is required' }
            await mgr.removeToken(server)
            return { deleted: server }
        }
        if (action === 'refresh') {
            if (!server) return { error: 'server is required' }
            const accessToken = await mgr.ensureFresh(server, { tokenUrl, clientId, clientSecret })
            if (!accessToken) return { error: 'refresh failed or no refresh token available' }
            return { access_token: accessToken }
        }
        return { error: 'unknown action' }
    },
})