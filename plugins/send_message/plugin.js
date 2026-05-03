import { _tool } from './handler.js'
export default { name: 'tool-send_message', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
