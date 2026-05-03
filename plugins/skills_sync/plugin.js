import { _tool } from './handler.js'
export default { name: 'tool-skills_sync', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
