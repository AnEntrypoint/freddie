import * as adapter from './handler.js'
export default { name: 'platform-yuanbao_media', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'yuanbao_media', module: adapter }) } }
