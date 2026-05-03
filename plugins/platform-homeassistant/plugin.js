import * as adapter from './handler.js'
export default { name: 'platform-homeassistant', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'homeassistant', module: adapter }) } }
