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

// Repo-root-scoped approval grants, persisted across turns and resumeTurn
// (Claude repo-root always-allow rules + Codex fork-preservation precedent).
// One JSON file keyed by cwd: { "<cwd>": ["bash", "write", ...] }. The 'always'
// resolution writes here; runTurn/resumeTurn seed control.approvedTools from it.
const GRANTS_GLOBAL = 'global'
let _grantsCache = null

async function grantsFile() {
    const { getFreddieHome } = await import('../home.js')
    const path = await import('node:path')
    return path.join(getFreddieHome(), 'approval-grants.json')
}

export async function loadApprovalGrants(cwd) {
    try {
        if (!_grantsCache) {
            const fs = await import('node:fs')
            _grantsCache = JSON.parse(fs.readFileSync(await grantsFile(), 'utf8'))
        }
    } catch { _grantsCache = _grantsCache || {} /* swallow: missing/corrupt grants file = no grants */ }
    return [...(_grantsCache[GRANTS_GLOBAL] || []), ...(cwd && _grantsCache[cwd] ? _grantsCache[cwd] : [])]
}

async function persistApprovalGrant(cwd, toolName) {
    try {
        const key = cwd || GRANTS_GLOBAL
        const grants = _grantsCache || {}
        if (!Array.isArray(grants[key])) grants[key] = []
        if (!grants[key].includes(toolName)) grants[key].push(toolName)
        _grantsCache = grants
        const fs = await import('node:fs')
        fs.writeFileSync(await grantsFile(), JSON.stringify(grants, null, 2))
    } catch { /* swallow: grant persistence is best-effort */ }
}

const turns = new Map() // sessionKey -> { actor, control, pendingApproval, startedAt }
// Per-session follow-up queue (kimi 1.31's Enter=queue channel). Lives outside
// the live-turn entry so queued prompts survive the turn they were typed
// during — the surface (REPL/gui-agent) drains them after turn completion.
const sessionQueues = new Map() // sessionKey -> string[]

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

// Queue a follow-up prompt for AFTER the running turn (kimi's Enter channel).
// Works with or without a live turn — the caller drains post-completion.
export function queueTurn(sessionKey, text) {
    if (!text) return false
    if (!sessionQueues.has(sessionKey)) sessionQueues.set(sessionKey, [])
    sessionQueues.get(sessionKey).push(String(text))
    emitTurnEvent(sessionKey, 'queue.append', { text: String(text), depth: sessionQueues.get(sessionKey).length })
    return true
}

export function drainQueue(sessionKey) {
    const q = sessionQueues.get(sessionKey) || []
    sessionQueues.delete(sessionKey)
    return q
}

export function queueDepth(sessionKey) {
    return (sessionQueues.get(sessionKey) || []).length
}

// Per-tool SESSION budget counters (Claude Code's WebSearch/subagent caps
// precedent): live outside the per-turn control so a budget holds across the
// whole conversation, not just one turn. agent.tool_budgets config maps
// tool name -> max calls per session (absent tool = uncapped).
const toolCounts = new Map() // sessionKey -> Map<toolName, count>

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

export function cancelTurn(sessionKey) {
    const t = turns.get(sessionKey)
    if (!t) return false
    try { t.actor.send({ type: 'INTERRUPT' }) } catch { return false }
    return true
}

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

// Called from the machine's executing_tools state before dispatching a gated
// tool. Resolves { approved, feedback? }. A missing registry entry means the
// turn is running detached (batch/cron with no control plane) — fail OPEN to
// preserve pre-approval-policy behavior for those paths.
export function requestApproval(sessionKey, { name, args, cwd }) {
    const t = turns.get(sessionKey)
    if (!t) return Promise.resolve({ approved: true })
    return new Promise((resolve) => {
        const id = randomUUID()
        // A non-finite approvalTimeoutMs (REPL foreground, kimi 1.40's reversal)
        // means NO auto-reject timer at all — the request waits for the human.
        const bounded = Number.isFinite(t.control.approvalTimeoutMs)
        const timer = bounded ? setTimeout(() => {
            if (t.pendingApproval?.id !== id) return
            t.pendingApproval = null
            emitTurnEvent(sessionKey, 'approval.resolved', { id, name, approved: false, timedOut: true, feedback: 'approval timed out' })
            resolve({ approved: false, feedback: 'approval timed out' })
        }, t.control.approvalTimeoutMs) : null
        if (timer && typeof timer.unref === 'function') timer.unref()
        t.pendingApproval = {
            id, name, cwd: cwd ?? null,
            resolve: (d) => { if (timer) clearTimeout(timer); resolve(d) },
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
        // Repo-root scoped persistence: future turns (and resumeTurn) in this
        // cwd skip the gate for this tool.
        await persistApprovalGrant(pending.cwd, pending.name)
    }
    emitTurnEvent(sessionKey, 'approval.resolved', { id: pending.id, name: pending.name, approved: !!approved, always: !!always, feedback: feedback ?? null })
    pending.resolve({ approved: !!approved, feedback: feedback ?? null })
    return true
}
