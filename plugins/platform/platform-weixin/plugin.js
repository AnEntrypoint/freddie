import * as adapter from './handler.js'
export default { name: 'platform-weixin', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'weixin', module: adapter }) } }
