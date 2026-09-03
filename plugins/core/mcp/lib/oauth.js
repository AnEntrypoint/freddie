export const mcpOauthTool = ({
    name: 'mcp_oauth',
    toolset: 'core',
    schema: { name: 'mcp_oauth', description: 'OAuth flow for an MCP server: build authorize URL, exchange code for token.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['authorize_url', 'exchange'] }, server_url: { type: 'string' }, client_id: { type: 'string' }, redirect_uri: { type: 'string' }, code: { type: 'string' }, code_verifier: { type: 'string' } }, required: ['action', 'server_url'] } },
    handler: async ({ action, server_url, client_id, redirect_uri, code, code_verifier }) => {
        if (action === 'authorize_url') {
            const u = new URL(server_url + '/authorize')
            if (client_id) u.searchParams.set('client_id', client_id)
            if (redirect_uri) u.searchParams.set('redirect_uri', redirect_uri)
            u.searchParams.set('response_type', 'code')
            u.searchParams.set('code_challenge_method', 'S256')
            return { url: u.toString() }
        }
        if (action === 'exchange') {
            const r = await fetch(server_url + '/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri, code_verifier, client_id }).toString() })
            return await r.json()
        }
        return { error: 'unknown action' }
    },
})

/**
 * MCP OAuth manager — token storage, refresh, and lifecycle management.
 * Stores tokens per server in the existing auth store (FileAuthStore or in-memory fallback).
 */
export class McpOAuthManager {
    /** @param {{ authStore: { getCredential: (name: string) => Promise<{name:string,value:string,updated:number}|null>, setCredential: (name:string, value:string) => Promise<{name:string,stored:boolean}>, deleteCredential: (name:string) => Promise<{name:string,deleted:boolean}>, listCredentials: () => Promise<string[]> } }} opts */
    constructor({ authStore }) {
        this._store = authStore
    }

    _key(serverName) { return `mcp__${encodeURIComponent(serverName)}__oauth` }

    /**
     * Store an OAuth token for an MCP server.
     * @param {string} serverName
     * @param {{ accessToken: string, refreshToken?: string, expiresAt?: number, tokenType?: string }} token
     */
    async storeToken(serverName, { accessToken, refreshToken, expiresAt, tokenType = 'Bearer' }) {
        await this._store.setCredential(this._key(serverName), JSON.stringify({
            access_token: accessToken,
            refresh_token: refreshToken || null,
            expires_at: expiresAt || null,
            token_type: tokenType,
            updated_at: Date.now()
        }))
    }

    /**
     * Get stored OAuth token for an MCP server.
     * Returns null if no token stored.
     * @param {string} serverName
     * @returns {Promise<object|null>}
     */
    async getToken(serverName) {
        const cred = await this._store.getCredential(this._key(serverName))
        if (!cred) return null
        try {
            return JSON.parse(cred.value)
        } catch { return null }
    }

    /**
     * Ensure the token is fresh. If expired and has a refresh token, attempt refresh.
     * Returns the access token string or null.
     * @param {string} serverName
     * @param {{ tokenUrl?: string, clientId?: string, clientSecret?: string }} [opts]
     * @returns {Promise<string|null>}
     */
    async ensureFresh(serverName, { tokenUrl, clientId, clientSecret } = {}) {
        const token = await this.getToken(serverName)
        if (!token) return null

        // If not expired (60s buffer), return as-is
        if (token.expires_at && Date.now() < token.expires_at - 60000) {
            return token.access_token
        }

        // Try refresh
        if (token.refresh_token && tokenUrl) {
            try {
                const resp = await fetch(tokenUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        grant_type: 'refresh_token',
                        refresh_token: token.refresh_token,
                        client_id: clientId || '',
                        client_secret: clientSecret || ''
                    }).toString()
                })
                if (!resp.ok) return null
                const data = await resp.json()
                await this.storeToken(serverName, {
                    accessToken: data.access_token,
                    refreshToken: data.refresh_token || token.refresh_token,
                    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
                    tokenType: data.token_type || 'Bearer'
                })
                return data.access_token
            } catch { return null }
        }

        return null // Expired and no refresh possible
    }

    /**
     * Remove stored token for an MCP server.
     * @param {string} serverName
     */
    async removeToken(serverName) {
        await this._store.deleteCredential(this._key(serverName))
    }

    /**
     * List all MCP servers with stored OAuth tokens.
     * @returns {Promise<string[]>}
     */
    async listServers() {
        const all = await this._store.listCredentials()
        return all
            .filter(n => n.startsWith('mcp__') && n.endsWith('__oauth'))
            .map(n => {
                const inner = n.slice(5, -7) // strip 'mcp__' prefix and '__oauth' suffix
                try { return decodeURIComponent(inner) } catch { return inner }
            })
    }
}