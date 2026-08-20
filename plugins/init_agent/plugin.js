import { initAgent } from './handler.js'

export default {
    name: 'init_agent',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(initAgent)
    },
}