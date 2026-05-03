export const _tool = ({
    name: 'approval',
    toolset: 'core',
    schema: {
        name: 'approval',
        description: 'Request approval for a destructive action. Returns the user decision (allow|deny). In non-interactive contexts, defaults to deny unless config.acp.always_allow includes this action.',
        parameters: { type: 'object', properties: { action: { type: 'string' }, reason: { type: 'string' } }, required: ['action'] },
    },
    handler: async ({ action, reason = '' }, ctx = {}) => {
        if (typeof ctx.askApproval === 'function') return await ctx.askApproval({ action, reason })
        return { decision: 'deny', reason: 'no interactive approval channel; supply ctx.askApproval' }
    },
})
