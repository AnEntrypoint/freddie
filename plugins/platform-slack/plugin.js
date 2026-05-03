import * as adapter from './handler.js'
export default { name: 'platform-slack', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'slack', module: adapter }) } }
