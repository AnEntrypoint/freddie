import { _tool } from './handler.js'
export default { name: 'tool-env_passthrough', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
