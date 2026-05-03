import { _tool } from './handler.js'
export default { name: 'tool-openrouter_client', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
