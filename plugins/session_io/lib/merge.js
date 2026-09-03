import { getMessages, appendMessage, createSession, getSession } from '../../../src/sessions.js'

export const _sessionMerge = {
    name: 'session_merge',
    toolset: 'core',
    schema: {
        name: 'session_merge',
        description:
            'Merge two sessions into a new session. Messages from both source sessions are combined in chronological order and written to a new session. ' +
            'Returns the new session ID.',
        parameters: {
            type: 'object',
            properties: {
                session_a: {
                    type: 'string',
                    description: 'First session ID.',
                },
                session_b: {
                    type: 'string',
                    description: 'Second session ID.',
                },
                title: {
                    type: 'string',
                    description: 'Optional title for the merged session.',
                },
            },
            required: ['session_a', 'session_b'],
        },
    },
    handler: async ({ session_a, session_b, title }) => {
        // Validate both sessions exist
        let sa, sb
        try {
            sa = await getSession(session_a)
            if (!sa) return { error: `session not found: ${session_a}` }
        } catch (e) {
            return { error: `failed to look up session_a: ${e.message || e}` }
        }
        try {
            sb = await getSession(session_b)
            if (!sb) return { error: `session not found: ${session_b}` }
        } catch (e) {
            return { error: `failed to look up session_b: ${e.message || e}` }
        }

        // Read messages from both sessions
        let msgsA, msgsB
        try {
            msgsA = await getMessages(session_a)
        } catch (e) {
            return { error: `failed to read messages from session_a: ${e.message || e}` }
        }
        try {
            msgsB = await getMessages(session_b)
        } catch (e) {
            return { error: `failed to read messages from session_b: ${e.message || e}` }
        }

        // Merge chronologically by timestamp
        const allMessages = [...msgsA, ...msgsB].sort((a, b) => (a.ts || 0) - (b.ts || 0))

        if (!allMessages.length) return { error: 'both sessions have no messages' }

        // Create a new session
        const mergedTitle = title || `merged: ${sa.title || session_a.slice(0, 8)} + ${sb.title || session_b.slice(0, 8)}`
        let newId
        try {
            newId = await createSession({ platform: 'cli', title: mergedTitle, model: sa.model || sb.model })
        } catch (e) {
            return { error: `failed to create merged session: ${e.message || e}` }
        }

        // Write all messages to the new session
        let written = 0
        for (const m of allMessages) {
            try {
                await appendMessage(newId, {
                    role: m.role || 'user',
                    content: m.content || '',
                    toolCalls: m.tool_calls || null,
                    toolCallId: m.tool_call_id || null,
                })
                written++
            } catch { /* continue */ }
        }

        const result = {
            ok: true,
            session_id: newId,
            title: mergedTitle,
            source_a: { id: session_a, messages: msgsA.length },
            source_b: { id: session_b, messages: msgsB.length },
            written,
        }
        // merged_messages duplicates `written` in the common (nothing
        // failed) case -- only worth a separate field when they diverge.
        if (written !== allMessages.length) {
            result.merged_messages = allMessages.length
            result.note = `${allMessages.length - written} messages could not be written`
        }
        return result
    },
}
