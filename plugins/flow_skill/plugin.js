import { _tool, setLogger } from './handler.js'

export default {
    name: 'flow-skill',
    surfaces: 'pi',
    register({ pi, log }) {
        setLogger(log)
        pi.tools.register(_tool)
    },
}