// think tool: no-op logging tool for structured reasoning.
// Matches kimi-cli's Think tool — a "no-op logging tool" that provides
// "structured reasoning placeholder for the model."
let _log = null

export function setLogger(log) {
    _log = log
}

export const _tool = {
    name: 'think',
    toolset: 'core',
    schema: {
        name: 'think',
        description: 'Record a structured thought for reasoning. This is a no-op logging tool — it simply records the thought and returns ok.',
        parameters: {
            type: 'object',
            properties: {
                thought: {
                    type: 'string',
                    description: 'The thought to record',
                },
            },
            required: ['thought'],
        },
    },
    handler: async (args) => {
        if (_log) _log.info(`thought: ${args.thought}`)
        return { ok: true }
    },
}