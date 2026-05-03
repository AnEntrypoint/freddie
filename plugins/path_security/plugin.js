import { _tool } from './handler.js'
export default { name: 'tool-path_security', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
