import * as adapter from './handler.js'
import { _tool } from './tool.js'
export default {
    name: 'platform-homeassistant',
    surfaces: 'pi',
    register({ pi }) {
        pi.platforms.register({ name: 'homeassistant', module: adapter })
        pi.tools.register(_tool)
    },
}
