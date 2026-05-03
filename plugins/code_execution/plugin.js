import { _tool } from './handler.js'
export default { name: 'tool-code_execution', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
