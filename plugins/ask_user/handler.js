export const _tool = {
    name: 'ask_user_question',
    toolset: 'core',
    schema: {
        name: 'ask_user_question',
        description:
            'Ask the user one or more structured questions during execution. ' +
            'Use this when you need clarification, a decision, or input before proceeding. ' +
            'Each question can have optional predefined options. ' +
            'In non-interactive contexts, returns { error } so you must proceed with stated assumptions.',
        parameters: {
            type: 'object',
            properties: {
                questions: {
                    type: 'array',
                    description:
                        'Array of 1-4 questions to present to the user. Each question must have a ' +
                        '"question" field (the text to ask), and may optionally have "header" (max 12 chars), ' +
                        '"options" (2-4 predefined choices each with "label" and optional "description"), ' +
                        'and "multi_select" (boolean, for multiple-choice questions).',
                    items: {
                        type: 'object',
                        properties: {
                            question: { type: 'string', description: 'The question text to present to the user' },
                            header: { type: 'string', description: 'Optional short header, max 12 characters' },
                            options: {
                                type: 'array',
                                description: 'Optional predefined choices (2-4). Each has a "label" (1-5 words) and optional "description".',
                                items: {
                                    type: 'object',
                                    properties: {
                                        label: { type: 'string', description: 'Short label for the option (1-5 words)' },
                                        description: { type: 'string', description: 'Optional longer description of what this option means' },
                                    },
                                    required: ['label'],
                                },
                            },
                            multi_select: { type: 'boolean', description: 'If true, user can select multiple options' },
                        },
                        required: ['question'],
                    },
                    minItems: 1,
                    maxItems: 4,
                },
            },
            required: ['questions'],
        },
    },
    handler: async ({ questions }, ctx = {}) => {
        if (typeof ctx.askUser !== 'function') {
            return { error: 'No interactive channel available', answers: {} }
        }
        try {
            const answers = await ctx.askUser(questions)
            return { answers }
        } catch (e) {
            return { error: String(e?.message || e), answers: {} }
        }
    },
}