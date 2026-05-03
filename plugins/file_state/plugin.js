import { _tool } from './handler.js'
export default { name: 'tool-file_state', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
