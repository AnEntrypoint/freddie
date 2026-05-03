import * as adapter from './handler.js'
export default { name: 'platform-telegram_network', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'telegram_network', module: adapter }) } }
