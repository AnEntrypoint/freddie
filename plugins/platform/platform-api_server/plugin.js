import * as adapter from './handler.js'
export default { name: 'platform-api-server', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'api_server', module: adapter }) } }
