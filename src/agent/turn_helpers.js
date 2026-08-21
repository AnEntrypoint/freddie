function mergeHookExtras(messages, r, tag) {
    if (!r) return messages
    const e = []
    if (r.systemMessage) e.push({ role: 'system', content: '[hook:' + tag + '] ' + r.systemMessage })
    if (r.additionalContext) e.push({ role: 'system', content: r.additionalContext })
    return e.length ? [...messages, ...e] : messages
}

// Shared dangling-tool_calls repair: any turn-ending path that can leave the
// LAST assistant message's tool_calls without a paired tool-role result
// (timeout, iteration-budget exhaustion, interrupt, or a mid-batch
// force-stop) produces the same malformed-transcript shape most provider
// APIs reject outright on replay. One pairing routine, reused by every exit
// path instead of re-deriving the pairing algorithm per call site.
function pairDanglingToolCalls(messages, reasonText) {
    const out = [...messages]
    const pairedIds = new Set(out.filter(m => m && m.role === 'tool' && m.tool_call_id).map(m => m.tool_call_id))
    const lastAssistant = [...out].reverse().find(m => m && m.role === 'assistant' && Array.isArray(m.tool_calls))
    if (lastAssistant) {
        for (const tc of lastAssistant.tool_calls) {
            const tcid = tc?.id || tc?.tool_call_id
            if (tcid && !pairedIds.has(tcid)) {
                out.push({ role: 'tool', tool_call_id: tcid, content: JSON.stringify({ error: reasonText }), synthetic: true })
            }
        }
    }
    return out
}

// On a turn timeout, discard-and-reject threw away the whole transcript --
// every consumer (CLI exec, gateway, cron, batch) got a bare rejection with no
// partial progress, no indication of which tool call was in-flight, nothing
// recoverable. Build a forgiving degraded result instead: read whatever
// context the actor's live snapshot holds, synthesize a paired tool-result for
// any tool_call the last assistant message made that never got an answer (so
// the transcript is well-formed if ever replayed through an LLM), and append a
// notice message. Ported from thebird's docs/freddie-chat.js runAgentTurn
// timeout handler (browser embedder, independently built the same recovery
// since it cannot import this module directly) -- see that file's
// setTimeout callback (~line 483) for the pattern this mirrors.
function timeoutResult(actor, timeoutMs) {
    const snap = actor.getSnapshot()
    const ctx = snap?.context || {}
    const messages = pairDanglingToolCalls(Array.isArray(ctx.messages) ? ctx.messages : [], 'timeout: tool_call interrupted')
    messages.push({ role: 'system', content: `Agent turn interrupted by ${timeoutMs / 1000}s timeout. Any tool calls above without paired results were cut short and did not complete.`, synthetic: true })
    return { messages, result: null, error: 'agent turn timeout', iterations: ctx.iterations || 0 }
}

export { mergeHookExtras, timeoutResult, pairDanglingToolCalls }
