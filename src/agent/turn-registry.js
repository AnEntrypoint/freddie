// Live-turn registry — core in-memory state + registry CRUD.
//
// runTurn/resumeTurn register their actor here so external surfaces (the
// `freddie wire` stdio server, the gui-agent WebSocket, the REPL) can interact
// with a RUNNING turn instead of waiting for it to finish.
//
// The registry is process-local by design (single-process dashboard/CLI); the
// wire log (<FREDDIE_HOME>/wire/*.jsonl) is the cross-process/durable record.
//
// This module owns the shared mutable state (turns/sessionQueues/toolCounts
// Maps) that steering/queue, approval, and cancel/revert all operate on.

import { onTurnEvent, emitTurnEvent } from './events.js'

export const turns = new Map() // sessionKey -> { actor, control, pendingApproval, startedAt }
// Per-session follow-up queue (kimi 1.31's Enter=queue channel). Lives outside
// the live-turn entry so queued prompts survive the turn they were typed
// during — the surface (REPL/gui-agent) drains them after turn completion.
export const sessionQueues = new Map() // sessionKey -> string[]

// Per-tool SESSION budget counters (Claude Code's WebSearch/subagent caps
// precedent): live outside the per-turn control so a budget holds across the
// whole conversation, not just one turn. agent.tool_budgets config maps
// tool name -> max calls per session (absent tool = uncapped).
export const toolCounts = new Map() // sessionKey -> Map<toolName, count>

export function registerTurn(sessionKey, entry) {
    if (turns.has(sessionKey)) throw new Error(`turn already live for session ${sessionKey}`)
    turns.set(sessionKey, entry)
    return entry
}

// Synchronous claim-before-await: reserves sessionKey in the SAME microtask
// as the caller's TOCTOU check, closing the window a multi-await preamble
// (hooks, autoRecall, wire-log search) would otherwise leave open between
// "is this key free" and "register it". Returns the entry on success, null
// if the key is already claimed — the caller must check for null and bail
// immediately, never fall through to the preamble. mergeTurnEntry fills in
// the remaining fields (actor, control) once the async setup completes.
export function claimTurn(sessionKey, partialEntry = {}) {
    if (turns.has(sessionKey)) return null
    const entry = { actor: null, control: null, pendingApproval: null, pendingQuestion: null, startedAt: Date.now(), ...partialEntry }
    turns.set(sessionKey, entry)
    return entry
}

// Fill in the fields a claimTurn() placeholder didn't have yet (actor,
// control) once the async preamble finishes. No-op (returns null) if the
// entry was removed from under us (e.g. unregisterTurn ran concurrently) --
// callers must treat a null return as "turn no longer live" rather than
// re-inserting a stale entry.
export function mergeTurnEntry(sessionKey, fields) {
    const entry = turns.get(sessionKey)
    if (!entry) return null
    Object.assign(entry, fields)
    return entry
}

export function getTurn(sessionKey) {
    return turns.get(sessionKey) || null
}

export function unregisterTurn(sessionKey) {
    const t = turns.get(sessionKey)
    if (t) {
        const q = t.pendingQuestion
        if (q) {
            t.pendingQuestion = null
            emitTurnEvent(sessionKey, 'question.resolved', { id: q.id, answers: {}, rejected: true, unregistered: true })
            try { q.reject(new Error('turn ended')) } catch { /* swallow: already-settled reject must not break unregister */ }
        }
        const a = t.pendingApproval
        if (a) {
            t.pendingApproval = null
            emitTurnEvent(sessionKey, 'approval.resolved', { id: a.id, name: a.name, approved: false, unregistered: true, feedback: 'turn ended' })
            try { a.resolve({ approved: false, feedback: 'turn ended' }) } catch { /* swallow: already-settled resolve must not break unregister */ }
        }
    }
    turns.delete(sessionKey)
}

export function listLiveTurns() {
    return [...turns.keys()]
}

export const subscribeTurn = onTurnEvent

export function noteToolCall(sessionKey, name) {
    if (!toolCounts.has(sessionKey)) toolCounts.set(sessionKey, new Map())
    const m = toolCounts.get(sessionKey)
    const n = (m.get(name) || 0) + 1
    m.set(name, n)
    return n
}

export function getToolCount(sessionKey, name) {
    return toolCounts.get(sessionKey)?.get(name) || 0
}
