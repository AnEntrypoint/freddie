import { runTurn } from '../../../src/agent/machine.js'

export const _tool = ({
    name: 'mixture_of_agents',
    toolset: 'core',
    schema: { name: 'mixture_of_agents', description: 'Run the same prompt through N sub-agents (different models or seeds), then synthesize the results. Reduces variance.', parameters: { type: 'object', properties: { prompt: { type: 'string' }, models: { type: 'array', items: { type: 'string' } }, callLLM: {} }, required: ['prompt'] } },
    handler: async ({ prompt, models = ['default'] }, ctx = {}) => {
        const llm = ctx.callLLM || null
        const runs = await Promise.all(models.map(m => runTurn({ prompt, model: m, callLLM: llm, timeoutMs: 30000 }).catch(e => ({ error: String(e.message || e) }))))
        const synthesized = runs.map(r => r.result || r.error || '').join('\n---\n')
        return { runs: runs.length, synthesized }
    },
})
