import { _tool } from './handler.js'
export default { name: 'tool-rl_training', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
