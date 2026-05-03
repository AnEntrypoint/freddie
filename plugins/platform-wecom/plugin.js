import * as adapter from './handler.js'
export default { name: 'platform-wecom', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'wecom', module: adapter }) } }
