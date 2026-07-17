export const _tool = ({
    name: 'clarify',
    toolset: 'core',
    schema: {
        name: 'clarify',
        description: 'Pose a clarifying question to the user before proceeding. Returns the user response. In non-interactive contexts, returns { error } so the agent must proceed with stated assumption.',
        parameters: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } }, required: ['question'] },
    },
    handler: async ({ question, options = [] }, ctx = {}) => {
        if (typeof ctx.askUser === 'function') return await ctx.askUser({ question, options })
        return { error: 'no interactive channel; assume defaults', question, options }
    },
})
