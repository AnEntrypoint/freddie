import { registry } from './registry.js'
import { runTurn } from '../agent/machine.js'

const MAX_DEPTH = 3

registry.register({
    name: 'delegate',
    toolset: 'core',
    schema: {
        name: 'delegate',
        description: 'Spawn a sub-agent to handle a focused task. Returns the sub-agent final result.',
        parameters: {
            type: 'object',
            properties: {
                task: { type: 'string' },
                model: { type: 'string' },
                max_iterations: { type: 'number', default: 30 },
            },
            required: ['task'],
        },
    },
    handler: async ({ task, model, max_iterations = 30 }, ctx = {}) => {
        const depth = (ctx.depth || 0) + 1
        if (depth > MAX_DEPTH) return { error: `delegate recursion depth exceeded (${MAX_DEPTH})` }
        const out = await runTurn({ prompt: task, model, callLLM: ctx.callLLM, maxIterations: max_iterations, timeoutMs: 60000 })
        return { result: out.result, error: out.error, iterations: out.iterations, depth }
    },
})
