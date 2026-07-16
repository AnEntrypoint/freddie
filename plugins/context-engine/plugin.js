import { buildContext, blocksToSystemMessage } from '../../src/context/engine.js'
export default {
    name: 'context-engine', surfaces: 'pi',
    register({ hooks }) {
        hooks.on('preLlmCall', async (p) => {
            if (!p?.message) return p
            const blocks = await buildContext({ message: p.message, plugins: ['file', 'skills'] })
            const sys = blocksToSystemMessage(blocks)
            return sys ? { ...p, prepend: [sys, ...(p.prepend || [])] } : p
        })
    },
}
