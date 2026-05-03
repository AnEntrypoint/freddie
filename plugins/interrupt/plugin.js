import { _tool } from './handler.js'
export default { name: 'tool-interrupt', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
