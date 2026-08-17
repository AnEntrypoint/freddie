import { _tool } from './handler.js'

export default {
    name: 'document-extraction',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(_tool)
    },
}
