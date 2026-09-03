import { _tool, setLogger, flowCommandHandler } from './handler.js'

export default {
    name: 'flow_skill',
    surfaces: 'pi',
    register({ pi, log }) {
        setLogger(log)
        pi.tools.register(_tool)
        if (pi.commands && typeof pi.commands.register === 'function') {
            pi.commands.register('flow', flowCommandHandler)
        }
    },
}
