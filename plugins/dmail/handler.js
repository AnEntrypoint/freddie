import { sendDmail, getCheckpointCount } from '../../src/agent/checkpoints.js'

export const _tool = {
    name: 'send_dmail',
    toolset: 'core',
    schema: {
        name: 'send_dmail',
        description:
            'Send a D-Mail (message to the past) that reverts conversation context to an earlier checkpoint, then injects this message. ' +
            'Use this when you realize earlier context is needed or when you want to compress the conversation by discarding intermediate turns ' +
            'while preserving critical information. On the next turn, the context will revert to the chosen checkpoint and this message will appear there.',
        parameters: {
            type: 'object',
            properties: {
                message: {
                    type: 'string',
                    description: 'The D-Mail message to inject at the checkpoint. Include all critical information that should survive the context revert.',
                },
                checkpoint_id: {
                    type: 'number',
                    description: 'The checkpoint number to revert to. Checkpoints are created automatically on each user message. The first user message creates checkpoint 1.',
                },
            },
            required: ['message', 'checkpoint_id'],
        },
    },
    handler: async (args, ctx) => {
        const sessionId = ctx?.sessionKey
        if (!sessionId) return { error: 'no active session — send_dmail requires a session context' }

        const result = sendDmail(sessionId, args.message, args.checkpoint_id)
        if (result.error) return result

        const total = getCheckpointCount(sessionId)
        return {
            ok: true,
            message: `D-Mail queued. Context will revert to checkpoint ${result.checkpointId} (of ${total}) on the next turn, and your message will be injected there.`,
        }
    },
}