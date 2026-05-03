import { _tool } from './handler.js'
export default { name: 'tool-credential_files', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
