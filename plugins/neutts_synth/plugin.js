import { _tool } from './handler.js'
export default { name: 'tool-neutts_synth', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
