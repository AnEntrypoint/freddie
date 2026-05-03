import { _tool } from './handler.js'
export default { name: 'tool-process_registry', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
