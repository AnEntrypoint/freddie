import { ContextPlugins, buildContext, blocksToSystemMessage } from '../../context/engine.js'
export const plugin = {
    name: 'context-engine',
    register: (ctx) => {
        ctx.registerHook('preLlmCall', async (p) => {
            if (!p?.message) return p
            const blocks = await buildContext({ message: p.message, plugins: ['file', 'skills'] })
            const sys = blocksToSystemMessage(blocks)
            return sys ? { ...p, prepend: [sys, ...(p.prepend || [])] } : p
        })
    },
}
export { ContextPlugins, buildContext, blocksToSystemMessage }
