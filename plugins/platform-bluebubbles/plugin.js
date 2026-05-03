import * as adapter from './handler.js'
export default { name: 'platform-bluebubbles', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'bluebubbles', module: adapter }) } }
