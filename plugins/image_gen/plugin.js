import { _tool } from './handler.js'
export default { name: 'tool-image_gen', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
