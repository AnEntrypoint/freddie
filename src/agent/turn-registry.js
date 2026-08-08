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

import { onTurnEvent } from './events.js'

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
