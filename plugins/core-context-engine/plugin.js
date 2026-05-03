import { buildContext, blocksToSystemMessage, ContextPlugins } from '../../src/context/engine.js'
export default {
    name: 'core-context-engine', surfaces: 'pi',
    register({ pi }) {
        pi.contexts.register({ name: 'engine', build: buildContext, render: blocksToSystemMessage, plugins: ContextPlugins })
    },
}
