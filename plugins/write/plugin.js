import { _tool } from './handler.js'
export default { name: 'tool-write', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
