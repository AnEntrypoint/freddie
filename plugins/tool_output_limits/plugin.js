import { _tool } from './handler.js'
export default { name: 'tool-tool_output_limits', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
