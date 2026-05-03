import { _tool } from './handler.js'
export default { name: 'tool-skills_index', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
