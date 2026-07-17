// Consolidated MCP plugin. Replaces 3 formerly-separate directories
// (mcp_tool, mcp_oauth, mcp_oauth_manager) with one registration point --
// oauth and oauth-manager are lifecycle stages (authorize/exchange, then
// persist/retrieve tokens) of the same MCP-server integration as mcp_tool.
import { mcpTool } from './lib/tool.js'
import { mcpOauthTool } from './lib/oauth.js'
import { mcpOauthManagerTool } from './lib/oauth-manager.js'

export default {
    name: 'mcp',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(mcpTool)
        pi.tools.register(mcpOauthTool)
        pi.tools.register(mcpOauthManagerTool)
    },
}
