import * as adapter from './handler.js'
export default { name: 'platform-matrix', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'matrix', module: adapter }) } }
