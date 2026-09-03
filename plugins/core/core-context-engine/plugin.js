import { buildContext, blocksToSystemMessage, ContextPlugins } from '../../../src/context/engine.js'
export default {
    name: 'core-context-engine', surfaces: 'pi',
    register({ pi, hooks }) {
        pi.contexts.register({ name: 'engine', build: buildContext, render: blocksToSystemMessage, plugins: ContextPlugins })
        hooks.on('preLlmCall', async (p) => {
            if (!p?.message) return p
            const blocks = await buildContext({ message: p.message, plugins: ['file', 'skills'] })
            const sys = blocksToSystemMessage(blocks)
            return sys ? { ...p, prepend: [sys, ...(p.prepend || [])] } : p
        })
    },
}
