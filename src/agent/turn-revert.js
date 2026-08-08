// Live-turn checkpoint-revert (kimi D-Mail class).

import { emitTurnEvent } from './events.js'
import { turns } from './turn-registry.js'

// Checkpoint-revert (kimi D-Mail class): rewind the RUNNING turn's context to
// `turnsBack` LLM steps before the current point. Computes the truncation from
// the CURRENT turn's wire-log events (message.append/tool events stream in
// live), sends REVERT with the rewound transcript, and clears the step journal
// (stale 'llm:N' replays would otherwise resurrect pre-revert results).
// Returns { ok, keptSteps } or { ok: false, reason }.
export async function revertTurn(sessionKey, turnsBack = 1) {
    const t = turns.get(sessionKey)
    if (!t) return { ok: false, reason: 'no live turn' }
    const { readWireLog } = await import('./events.js')
    const events = readWireLog(sessionKey)
    // Current turn = events since the last session.start.
    let startIdx = 0
    for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].event === 'session.start') { startIdx = i; break }
    }
    // Step boundaries inside the turn = assistant message.appends.
    const boundaries = []
    for (let i = startIdx; i < events.length; i++) {
        const e = events[i]
        if (e.event === 'message.append' && e.data?.role === 'assistant') boundaries.push(i)
    }
    if (boundaries.length < turnsBack) return { ok: false, reason: 'not enough steps to revert that far' }
    const cutAt = boundaries[boundaries.length - turnsBack]
    // Rebuild the transcript from everything BEFORE the cut boundary.
    const { transcriptFromWire } = await import('./events.js')
    const msgs = []
    for (const env of events.slice(0, cutAt)) {
        const { event, data } = env
        if (event === 'message.append') {
            if (data.role === 'user') msgs.push({ role: 'user', content: data.content })
            else if (data.role === 'assistant') msgs.push({ role: 'assistant', content: data.content || '', tool_calls: data.tool_calls || [] })
        } else if (event === 'steer.append' || event === 'queue.append') {
            msgs.push({ role: 'user', content: data.text })
        } else if (event === 'tool.end') {
            msgs.push({ role: 'tool', tool_call_id: data.toolCallId, content: data.denied ? JSON.stringify({ error: 'tool call denied by user' }) : (typeof data.result === 'string' ? data.result : JSON.stringify(data.result ?? '')) })
        }
    }
    try { t.actor.send({ type: 'REVERT', messages: msgs }) } catch (e) { return { ok: false, reason: String(e?.message || e) } }
    try {
        const { clearSteps } = await import('../machines/step-journal.js')
        await clearSteps(sessionKey)
    } catch { /* swallow: journal cleanup is best-effort */ }
    emitTurnEvent(sessionKey, 'status.update', { reverted: true, turnsBack, keptMessages: msgs.length })
    return { ok: true, keptSteps: boundaries.length - turnsBack }
}
