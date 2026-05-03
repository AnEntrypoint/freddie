import { _tool } from './handler.js'
export default { name: 'tool-osv_check', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
