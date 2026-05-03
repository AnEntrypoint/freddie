import * as adapter from './handler.js'
export default { name: 'platform-email', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'email', module: adapter }) } }
