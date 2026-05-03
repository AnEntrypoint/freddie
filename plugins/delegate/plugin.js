import { _tool } from './handler.js'
export default { name: 'tool-delegate', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
