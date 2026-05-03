import * as adapter from './handler.js'
export default { name: 'platform-sms', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'sms', module: adapter }) } }
