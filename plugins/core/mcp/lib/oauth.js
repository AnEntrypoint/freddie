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
