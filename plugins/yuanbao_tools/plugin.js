import { _tool } from './handler.js'
export default { name: 'tool-yuanbao_tools', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
