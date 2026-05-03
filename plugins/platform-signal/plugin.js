import * as adapter from './handler.js'
export default { name: 'platform-signal', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'signal', module: adapter }) } }
