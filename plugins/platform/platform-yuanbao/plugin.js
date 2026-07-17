import * as adapter from './handler.js'
export default { name: 'platform-yuanbao', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'yuanbao', module: adapter }) } }
