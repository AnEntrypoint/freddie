import { _tool } from './handler.js'
export default { name: 'tool-vision', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
