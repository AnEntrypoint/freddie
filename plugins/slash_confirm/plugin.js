import { _tool } from './handler.js'
export default { name: 'tool-slash_confirm', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
