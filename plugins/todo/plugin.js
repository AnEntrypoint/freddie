import { _tool } from './handler.js'
export default { name: 'tool-todo', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
