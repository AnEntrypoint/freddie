import { _tool } from './handler.js'
export default { name: 'tool-ansi_strip', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
