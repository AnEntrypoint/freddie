import { sessionSearchTool, sessionListTool } from './lib/search.js'

export default {
    name: 'sessions',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(sessionSearchTool)
        pi.tools.register(sessionListTool)
    },
}
