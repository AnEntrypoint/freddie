import * as adapter from './handler.js'
import { _tool } from './tool.js'
export default {
    name: 'platform-discord',
    surfaces: 'pi',
    register({ pi }) {
        pi.platforms.register({ name: 'discord', module: adapter })
        pi.tools.register(_tool)
    },
}
