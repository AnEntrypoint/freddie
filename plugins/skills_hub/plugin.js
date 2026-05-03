import { _tool } from './handler.js'
export default { name: 'tool-skills_hub', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
