import { _tool } from './handler.js'
export default { name: 'tool-feishu_drive', surfaces: 'pi', register({ pi }) { pi.tools.register(_tool) } }
