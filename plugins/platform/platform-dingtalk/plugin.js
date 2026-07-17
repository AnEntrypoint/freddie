import * as adapter from './handler.js'
export default { name: 'platform-dingtalk', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'dingtalk', module: adapter }) } }
