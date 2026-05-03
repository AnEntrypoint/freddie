import * as adapter from './handler.js'
export default { name: 'platform-yuanbao_sticker', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'yuanbao_sticker', module: adapter }) } }
