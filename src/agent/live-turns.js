// Live-turn registry — the control plane for in-flight agent turns.
//
// runTurn/resumeTurn register their actor here so external surfaces (the
// `freddie wire` stdio server, the gui-agent WebSocket, the REPL) can interact
// with a RUNNING turn instead of waiting for it to finish:
//
//   subscribeTurn(key, fn)     — stream of event envelopes (src/agent/events.js)
//   steerTurn(key, text)       — inject a user message consumed at the next
//                                tool_calls→prompting boundary (kimi's SteerInput)
//   cancelTurn(key)            — INTERRUPT the machine (takes effect at the
//                                next state boundary)
//   requestApproval / resolveApproval — pause-before-tool-dispatch gate driven
//                                by agent.approval_policy
//
// The registry is process-local by design (single-process dashboard/CLI); the
// wire log (<FREDDIE_HOME>/wire/*.jsonl) is the cross-process/durable record.

import { randomUUID } from 'node:crypto'
import { emitTurnEvent, onTurnEvent } from './events.js'

const turns = new Map() // sessionKey -> { actor, control, pendingApproval, startedAt }

export function registerTurn(sessionKey, entry) {
    turns.set(sessionKey, entry)
    return entry
}

export function getTurn(sessionKey) {
    return turns.get(sessionKey) || null
}

export function unregisterTurn(sessionKey) {
    turns.delete(sessionKey)
}

export function listLiveTurns() {
    return [...turns.keys()]
}

export const subscribeTurn = onTurnEvent

export function steerTurn(sessionKey, text) {
    const t = turns.get(sessionKey)
    if (!t || !text) return false
    t.control.steers.push(String(text))
    emitTurnEvent(sessionKey, 'steer.append', { text: String(text) })
    return true
}

export function cancelTurn(sessionKey) {
    const t = turns.get(sessionKey)
    if (!t) return false
    try { t.actor.send({ type: 'INTERRUPT' }) } catch { return false }
    return true
}

// Called from the machine's executing_tools state before dispatching a gated
// tool. Resolves { approved, feedback? }. A missing registry entry means the
// turn is running detached (batch/cron with no control plane) — fail OPEN to
// preserve pre-approval-policy behavior for those paths.
export function requestApproval(sessionKey, { name, args, cwd }) {
    const t = turns.get(sessionKey)
    if (!t) return Promise.resolve({ approved: true })
    return new Promise((resolve) => {
        const id = randomUUID()
        const timer = setTimeout(() => {
            if (t.pendingApproval?.id !== id) return
            t.pendingApproval = null
            emitTurnEvent(sessionKey, 'approval.resolved', { id, name, approved: false, timedOut: true, feedback: 'approval timed out' })
            resolve({ approved: false, feedback: 'approval timed out' })
        }, t.control.approvalTimeoutMs)
        if (typeof timer.unref === 'function') timer.unref()
        t.pendingApproval = {
            id, name,
            resolve: (d) => { clearTimeout(timer); resolve(d) },
        }
        emitTurnEvent(sessionKey, 'approval.request', { id, name, args, cwd: cwd ?? null })
    })
}

export async function resolveApproval(sessionKey, { id, approved, always = false, feedback = null } = {}) {
    const t = turns.get(sessionKey)
    const pending = t?.pendingApproval
    if (!pending) return false
    if (id && pending.id !== id) return false
    t.pendingApproval = null
    // "always" whitelists this tool name for the rest of the turn (kimi's
    // approve_for_session, scoped to one turn rather than a session), and is
    // mirrored into the shared approval_state module so /yolo-style tooling
    // sees it too.
    if (always && approved) {
        t.control.approvedTools.add(pending.name)
        try {
            const { addAutoApprovedAction } = await import('../../plugins/core/approval_state.js')
            addAutoApprovedAction(sessionKey, pending.name)
        } catch { /* swallow: approval_state mirror is best-effort */ }
    }
    emitTurnEvent(sessionKey, 'approval.resolved', { id: pending.id, name: pending.name, approved: !!approved, always: !!always, feedback: feedback ?? null })
    pending.resolve({ approved: !!approved, feedback: feedback ?? null })
    return true
}
