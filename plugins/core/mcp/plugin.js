// Consolidated MCP plugin. Replaces 3 formerly-separate directories
// (mcp_tool, mcp_oauth, mcp_oauth_manager) with one registration point --
// oauth and oauth-manager are lifecycle stages (authorize/exchange, then
// persist/retrieve tokens) of the same MCP-server integration as mcp_tool.
import { mcpTool } from './lib/tool.js'
import { mcpOauthTool } from './lib/oauth.js'
import { mcpOauthManagerTool } from './lib/oauth-manager.js'
import { autoConnectMcpServers } from './lib/auto-connect.js'

export default {
    name: 'mcp',
    surfaces: 'pi',
    register({ pi, hooks }) {
        pi.tools.register(mcpTool)
        pi.tools.register(mcpOauthTool)
        pi.tools.register(mcpOauthManagerTool)
        // Auto-connect any MCP servers declared in config / standard `.mcp.json`
        // (incl. an optional one-time install step) at session start, so their
        // tools are already available to a turn. Fail-open: a missing/offline
        // server must not block the rest of the turn.
        if (hooks?.on) {
            hooks.on('onSessionStart', () => autoConnectMcpServers().catch(() => null))
        }
    },
}
