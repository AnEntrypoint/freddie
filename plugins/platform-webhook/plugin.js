import * as adapter from './handler.js'
export default { name: 'platform-webhook', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'webhook', module: adapter }) } }
