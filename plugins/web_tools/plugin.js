import { _tool0, _tool1 } from './handler.js'
export default { name: 'tool-web_tools', surfaces: 'pi', register({ pi }) { for (const t of [_tool0, _tool1]) pi.tools.register(t) } }
