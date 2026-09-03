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

// Per-session cache-preserving decay cadence (per direct user request):
// decayToBudget/removeFullyDecayedPairs rewrite message CONTENT in place on
// every LLM step by default, which invalidates a provider's prompt-cache
// prefix from the earliest mutated message onward on every single call --
// paying that invalidation cost every step to shave a few hundred tokens off
// an already-under-budget transcript is a bad trade. Tracks the total
// estimated token count as of the last turn decay ACTUALLY mutated
// something for this session, so machine_builder.js can skip re-running
// decay entirely until the transcript has grown by a real, cache-worth-
// invalidating amount since that point.
export const decayCheckpoints = new Map() // sessionKey -> last-decayed total token count

// growthSinceLastDecay(sessionKey, totalTokens, thresholdTokens): true once
// totalTokens has grown by >= thresholdTokens since the last checkpoint (or
// there is no checkpoint yet -- a session's first decay pass always runs).
// Callers only advance the checkpoint via markDecayCheckpoint once they
// actually run/mutate decay, so a call that finds "not due yet" leaves the
// checkpoint untouched -- the growth threshold is measured from the last
// REAL decay, never from an unrelated later read.
export function growthSinceLastDecay(sessionKey, totalTokens, thresholdTokens) {
    const last = decayCheckpoints.get(sessionKey)
    return last == null || (totalTokens - last) >= thresholdTokens
}

export function markDecayCheckpoint(sessionKey, totalTokens) {
    decayCheckpoints.set(sessionKey, totalTokens)
}

// Per-session cumulative usage totals (input/output/cache-hit tokens),
// process-lifetime (not persisted -- a real accounting store would need its
// own durable schema; this exists for live display, not billing). Per
// direct user request: freddie tracks this ITSELF rather than depending
// solely on a provider reporting it, since the providers actually
// configurable here (xai-oauth, opencode-zen) report all-zero usage on
// every real response, live-verified. noteUsage prefers the REAL provider
// figures when non-zero (some providers do populate them correctly), and
// falls back to freddie's own estimateMessagesTokens-based estimate
// otherwise -- so an accurate provider is trusted over our own guess, but a
// silent/broken one never leaves the running total stuck at zero.
export const usageTotals = new Map() // sessionKey -> { input, output, cacheHit }

export function noteUsage(sessionKey, { input = 0, output = 0, cacheHit = 0 } = {}) {
    const cur = usageTotals.get(sessionKey) || { input: 0, output: 0, cacheHit: 0 }
    const next = { input: cur.input + input, output: cur.output + output, cacheHit: cur.cacheHit + cacheHit }
    usageTotals.set(sessionKey, next)
    return next
}

export function getUsageTotals(sessionKey) {
    return usageTotals.get(sessionKey) || { input: 0, output: 0, cacheHit: 0 }
}

// A claim held far longer than any legitimate turn should ever take is
// almost certainly abandoned, not still working. Every legitimate path
// already releases its claim well before this: driveAgentActor's own
// timeout branch fires at the caller's timeoutMs (a live-witnessed default
// of 120s for a real consumer) and unconditionally unregisters; a caller
// wanting genuinely long-running work is expected to let that timeout fire
// and explicitly resumeTurn() against the persisted snapshot afterward (see
// turn_driver.js's timeout-path comment), not hold one claimTurn() entry
// open for the duration. So a claim only ever reaches this ceiling when
// something else already went wrong -- an unhandled exception on an exotic
// path between claimTurn and driveAgentActor's own cleanup, a process-level
// race during a host restart, or any other defect that skips the normal
// release. Live-witnessed: a downstream consumer (casey) had a single
// sessionKey stuck "live" for 40+ minutes with the underlying turn long
// gone, permanently failing every subsequent turn for that conversation
// ("turn already live for session ...") until a manual process restart --
// this is the self-heal that removes the need for that restart. The
// threshold is deliberately far above any real turn duration so it never
// interferes with legitimate work; it exists purely as a last-resort
// backstop, not a normal turn-duration budget.
const STALE_CLAIM_MS = 15 * 60_000

function isAbandoned(entry) {
    return !!entry && (Date.now() - entry.startedAt) > STALE_CLAIM_MS
}

export function registerTurn(sessionKey, entry) {
    const existing = turns.get(sessionKey)
    if (existing) {
        if (!isAbandoned(existing)) throw new Error(`turn already live for session ${sessionKey}`)
        turns.delete(sessionKey)
    }
    turns.set(sessionKey, entry)
    return entry
}

// Synchronous claim-before-await: reserves sessionKey in the SAME microtask
// as the caller's TOCTOU check, closing the window a multi-await preamble
// (hooks, autoRecall, wire-log search) would otherwise leave open between
// "is this key free" and "register it". Returns the entry on success, null
// if the key is already claimed — the caller must check for null and bail
// immediately, never fall through to the preamble. mergeTurnEntry fills in
// the remaining fields (actor, control) once the async setup completes. An
// existing entry older than STALE_CLAIM_MS is treated as abandoned and
// force-released before the fresh claim proceeds (see the constant's own
// comment above) -- the ordinary case (a genuinely live concurrent turn) is
// unaffected, since it is always far younger than the threshold.
export function claimTurn(sessionKey, partialEntry = {}) {
    const existing = turns.get(sessionKey)
    if (existing) {
        if (!isAbandoned(existing)) return null
        turns.delete(sessionKey)
    }
    const entry = { actor: null, control: null, pendingApproval: null, pendingQuestion: null, startedAt: Date.now(), ...partialEntry }
    turns.set(sessionKey, entry)
    return entry
}

// Fill in the fields a claimTurn() placeholder didn't have yet (actor,
// control) once the async preamble finishes. No-op (returns null) if the
// entry was removed from under us (e.g. unregisterTurn ran concurrently) --
// callers must treat a null return as "turn no longer live" rather than
// re-inserting a stale entry.
//
// A cancelTurn() call landing during the placeholder window (before actor/
// abortController exist) sets entry.cancelRequested=true (turn-steering.js)
// but cannot fire the abort/INTERRUPT it needs to actually stop the turn --
// there is nothing to abort/send to yet. Once this call supplies those
// fields, replay the deferred cancel immediately so it is never silently
// lost — live-witnessed defect this fixes: cancelTurn() returning false (or,
// after the accompanying turn-steering.js fix, true but a no-op) for a
// genuinely registered turn whose actor/abortController simply hadn't been
// filled in yet, letting the turn run to completion uninterrupted.
export function mergeTurnEntry(sessionKey, fields) {
    const entry = turns.get(sessionKey)
    if (!entry) return null
    Object.assign(entry, fields)
    if (entry.cancelRequested) {
        try { entry.abortController?.abort(new Error('turn cancelled')) } catch { /* swallow: abort must not break setup */ }
        try { entry.actor?.send({ type: 'INTERRUPT' }) } catch { /* swallow: send must not break setup */ }
    }
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
