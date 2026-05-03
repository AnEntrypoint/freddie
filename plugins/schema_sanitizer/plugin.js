import { _tool } from './handler.js'
export default { name: 'tool-schema_sanitizer', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
