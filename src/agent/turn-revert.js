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
    // REVERT only reassigns context.messages (machine_builder.js's root
    // transient action) — it does NOT abort whatever's mid-flight in
    // executing_tools. A pending question/approval promise left unsettled
    // would resolve later against a transcript that's already been rewound
    // out from under it (or hang forever for askUser, which has no
    // auto-reject timer by design). Settle both gates first, same shape as
    // cancelTurn in turn-steering.js.
    const q = t.pendingQuestion
    if (q) {
        t.pendingQuestion = null
        emitTurnEvent(sessionKey, 'question.resolved', { id: q.id, answers: {}, rejected: true, reverted: true })
        try { q.reject(new Error('turn reverted')) } catch { /* swallow: already-settled reject must not break revert */ }
    }
    const a = t.pendingApproval
    if (a) {
        t.pendingApproval = null
        emitTurnEvent(sessionKey, 'approval.resolved', { id: a.id, name: a.name, approved: false, reverted: true, feedback: 'turn reverted' })
        try { a.resolve({ approved: false, feedback: 'turn reverted' }) } catch { /* swallow: already-settled resolve must not break revert */ }
    }
    // Same defect class as cancelTurn's pre-fix null-actor throw
    // (turn-steering.js): t.actor is null during claimTurn's placeholder
    // window, before mergeTurnEntry fills it in. Currently unreachable in
    // practice for revert specifically -- computing `boundaries` above
    // requires at least one completed LLM round-trip's wire-log
    // message.append event, by which point actor is long since set -- but
    // guarded the same way as cancelTurn for defense-in-depth against a
    // future caller that reaches this before that precondition holds.
    if (!t.actor) return { ok: false, reason: 'turn not yet fully registered' }
    try { t.actor.send({ type: 'REVERT', messages: msgs }) } catch (e) { return { ok: false, reason: String(e?.message || e) } }
    try {
        const { clearSteps } = await import('../machines/step-journal.js')
        await clearSteps(sessionKey)
    } catch { /* swallow: journal cleanup is best-effort */ }
    // Bring the two OTHER durable records of this conversation (the wire-log
    // file, and sessions.db's messages table) into agreement with the actor's
    // now-rewound live context -- without this, GET /api/sessions/:id/wire,
    // `freddie session show <id>`, and gui-agent's priorFromWire all keep
    // showing the STALE pre-revert transcript even though the live turn is
    // now operating on the rewound one. Truncate the wire log to the cut
    // boundary (same truncate-not-append scheme the sibling /undo CLI path
    // already uses via truncateWireLog, so there's one consistent convention
    // rather than two), then purge+rebuild sessions.db's messages from the
    // now-truncated wire log the same way /undo does.
    try {
        const { truncateWireLog } = await import('./events.js')
        const { purgeSessionMessages, appendMessage } = await import('../sessions.js')
        truncateWireLog(sessionKey, cutAt)
        await purgeSessionMessages(sessionKey)
        for (const m of transcriptFromWire(sessionKey)) {
            await appendMessage(sessionKey, { role: m.role, content: m.content, toolCalls: m.tool_calls || null, toolCallId: m.tool_call_id || null })
        }
    } catch { /* swallow: durable-record reconciliation is best-effort -- the live actor context (the source of truth for the running turn) is already correct regardless */ }
    emitTurnEvent(sessionKey, 'status.update', { reverted: true, turnsBack, keptMessages: msgs.length })
    return { ok: true, keptSteps: boundaries.length - turnsBack }
}
