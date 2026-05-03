import * as adapter from './handler.js'
export default { name: 'platform-qqbot', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'qqbot', module: adapter }) } }
