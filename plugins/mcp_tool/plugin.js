import { _tool } from './handler.js'
export default { name: 'tool-mcp_tool', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
