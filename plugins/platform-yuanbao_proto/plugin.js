import * as adapter from './handler.js'
export default { name: 'platform-yuanbao_proto', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'yuanbao_proto', module: adapter }) } }
