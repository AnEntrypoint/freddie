import * as adapter from './handler.js'
export default { name: 'platform-mattermost', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'mattermost', module: adapter }) } }
