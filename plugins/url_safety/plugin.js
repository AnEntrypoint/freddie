import { _tool } from './handler.js'
export default { name: 'tool-url_safety', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
