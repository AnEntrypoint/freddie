import { _tool } from './handler.js'
export default { name: 'tool-xai_http', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
