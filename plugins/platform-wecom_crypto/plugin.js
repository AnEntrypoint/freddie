import * as adapter from './handler.js'
export default { name: 'platform-wecom_crypto', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'wecom_crypto', module: adapter }) } }
