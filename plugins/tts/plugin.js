import { _tool } from './handler.js'
export default { name: 'tool-tts', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
