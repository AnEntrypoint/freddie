import { _tool } from './handler.js'
export default { name: 'tool-managed_tool_gateway', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
