import { _tool } from './handler.js'

export default {
    name: 'dmail',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(_tool)
    },
}