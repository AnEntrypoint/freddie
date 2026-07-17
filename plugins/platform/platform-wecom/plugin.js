import * as adapter from './handler.js'
import * as callbackAdapter from './callback.js'
import * as crypto from './crypto.js'
export default {
    name: 'platform-wecom',
    surfaces: 'pi',
    register({ pi }) {
        pi.platforms.register({ name: 'wecom', module: adapter })
        pi.platforms.register({ name: 'wecom_callback', module: callbackAdapter })
    },
}
export { crypto }
