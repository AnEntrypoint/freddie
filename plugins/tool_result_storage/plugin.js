import { _tool } from './handler.js'
export default { name: 'tool-tool_result_storage', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
