import { _tool } from './handler.js'
export default { name: 'tool-website_policy', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
