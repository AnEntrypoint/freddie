import { compress, shouldCompress, computeCompressionPlan } from '../../src/agent/compress/index.js'
export default {
    name: 'core-compressor', surfaces: 'pi', requires: ['core-agent-machine'],
    register({ pi, hooks }) {
        pi.agentExts.register({ name: 'compress', fn: compress })
        pi.agentExts.register({ name: 'shouldCompress', fn: shouldCompress })
        hooks.on('preLlmCall', async (payload) => {
            if (payload && shouldCompress(payload.messages || [])) {
                const plan = computeCompressionPlan(payload.messages)
                if (plan?.compressed) return { ...payload, messages: plan.compressed }
            }
            return payload
        })
    },
}
