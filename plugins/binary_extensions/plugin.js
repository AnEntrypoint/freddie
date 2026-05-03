import { _tool } from './handler.js'
export default { name: 'tool-binary_extensions', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
