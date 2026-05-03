import * as adapter from './handler.js'
export default { name: 'platform-feishu', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'feishu', module: adapter }) } }
