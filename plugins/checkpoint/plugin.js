import { _tool } from './handler.js'
export default { name: 'tool-checkpoint', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
