import { _tool } from './handler.js'
export default { name: 'tool-debug_helpers', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
