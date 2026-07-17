import * as adapter from './handler.js'
export default { name: 'platform-telegram', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'telegram', module: adapter }) } }
