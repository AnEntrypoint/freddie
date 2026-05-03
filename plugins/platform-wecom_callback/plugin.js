import * as adapter from './handler.js'
export default { name: 'platform-wecom_callback', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'wecom_callback', module: adapter }) } }
