import { listCheckpoints, revertToCheckpoint, getCheckpointDiff, getCheckpointCount } from '../../src/agent/checkpoints.js'

export const _tool = {
    name: 'checkpoint',
    toolset: 'core',
    schema: {
        name: 'checkpoint',
        description:
            'Manage conversation checkpoints. Checkpoints are automatic snapshots of the full conversation ' +
            'created on every user message. Use this tool to inspect, revert, or diff between checkpoints.',
        parameters: {
            type: 'object',
            properties: {
                subcommand: {
                    type: 'string',
                    description: 'The checkpoint operation: "list" (show all checkpoints), "revert" (restore to a checkpoint), or "diff" (show messages between two checkpoints).',
                    enum: ['list', 'revert', 'diff'],
                },
                checkpoint_id: {
                    type: 'number',
                    description: 'The checkpoint ID to revert to. Required for the "revert" subcommand.',
                },
                from_id: {
                    type: 'number',
                    description: 'The starting checkpoint ID for diff. Required for the "diff" subcommand.',
                },
                to_id: {
                    type: 'number',
                    description: 'The ending checkpoint ID for diff. Required for the "diff" subcommand. Defaults to the latest checkpoint if omitted.',
                },
            },
            required: ['subcommand'],
        },
    },
    handler: async (args, ctx) => {
        const sessionId = ctx?.sessionKey
        if (!sessionId) return { error: 'no active session — checkpoint operations require a session context' }

        const sub = args.subcommand

        if (sub === 'list') {
            const checkpoints = listCheckpoints(sessionId)
            if (!checkpoints.length) return { message: 'No checkpoints yet — send at least one message first.' }
            const lines = checkpoints.map(cp =>
                `  #${cp.id}  ${cp.timestamp}  (${cp.messageCount} messages)`
            )
            return { message: `Checkpoints for this session:\n${lines.join('\n')}` }
        }

        if (sub === 'revert') {
            const id = args.checkpoint_id
            if (id == null) return { error: 'checkpoint_id is required for the "revert" subcommand' }
            const messages = revertToCheckpoint(sessionId, id)
            if (!messages) {
                const total = getCheckpointCount(sessionId)
                return { error: `checkpoint ${id} not found. Available range: 1-${total}` }
            }
            return {
                ok: true,
                message: `Reverted to checkpoint ${id}. The conversation now has ${messages.length} messages.`,
                messages,
                checkpoint_id: id,
            }
        }

        if (sub === 'diff') {
            const fromId = args.from_id
            const toId = args.to_id ?? getCheckpointCount(sessionId)
            if (fromId == null) return { error: 'from_id is required for the "diff" subcommand' }
            const result = getCheckpointDiff(sessionId, fromId, toId)
            if (!result) {
                const total = getCheckpointCount(sessionId)
                return { error: `checkpoint range ${fromId}..${toId} not found. Available range: 1-${total}` }
            }
            return {
                ok: true,
                message: `Diff between checkpoint ${fromId} (${result.fromTimestamp}) and checkpoint ${toId} (${result.toTimestamp}): ${result.messages.length} messages changed.`,
                messages: result.messages,
                from_id: fromId,
                to_id: toId,
            }
        }

        return { error: `unknown subcommand: ${sub}` }
    },
}