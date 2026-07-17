import * as adapter from './handler.js'
export default { name: 'platform-whatsapp', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'whatsapp', module: adapter }) } }
