import * as adapter from './handler.js'
export default { name: 'platform-discord', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'discord', module: adapter }) } }
