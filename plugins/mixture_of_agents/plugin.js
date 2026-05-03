import { _tool } from './handler.js'
export default { name: 'tool-mixture_of_agents', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
