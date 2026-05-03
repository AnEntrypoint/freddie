import { _tool } from './handler.js'
export default { name: 'tool-voice_mode', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
