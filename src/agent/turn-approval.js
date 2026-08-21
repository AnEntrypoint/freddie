// Live-turn approval gate: requestApproval / resolveApproval / persisted
// approval grants.
//
//   requestApproval / resolveApproval — pause-before-tool-dispatch gate driven
//                                by agent.approval_policy

import { randomUUID } from 'node:crypto'
import { emitTurnEvent } from './events.js'
import { turns } from './turn-registry.js'
import { redactSecrets } from '../auth.js'
import { logger } from '../observability/log.js'

const log = logger('approval')

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

// Called from the machine's executing_tools state before dispatching a gated
// tool. Resolves { approved, feedback? }. A missing registry entry historically
// meant the turn was running detached (batch/cron with no control plane), and
// this fails OPEN to preserve pre-approval-policy behavior for those paths --
// but registerTurn now runs unconditionally for every runTurn/resumeTurn call
// (see AGENTS.md's Wire protocol Approvals paragraph), so this branch SHOULD
// be unreachable in normal operation. It is kept as a defensive fallback
// rather than an assertion because a caller driving the machine directly
// without going through runTurn/resumeTurn (a future integration, a test
// harness) could still hit it -- but a gated tool call silently running
// without approval is exactly the failure this whole subsystem exists to
// prevent, so if it ever DOES fire that is itself a security-relevant event
// worth a durable, searchable log line, not a silent pass-through.
export function requestApproval(sessionKey, { name, args, cwd }) {
    const t = turns.get(sessionKey)
    if (!t) {
        log.warn('approval gate bypassed: no registered turn for session', { sessionKey, tool: name })
        return Promise.resolve({ approved: true })
    }
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
        emitTurnEvent(sessionKey, 'approval.request', { id, name, args: redactSecrets(args), cwd: cwd ?? null })
    })
}

export async function resolveApproval(sessionKey, { id, approved, always = false, feedback = null } = {}) {
    const t = turns.get(sessionKey)
    const pending = t?.pendingApproval
    if (!pending) return false
    // Mandatory id match — symmetric with resolveQuestion's guard
    // (turn-question.js). A falsy/omitted id must NOT fall through to
    // resolving whatever happens to be pending: plugins/wire/plugin.js and
    // gui-agent's WS 'approve' handler both forward client-supplied params
    // verbatim, so an id-less resolve from an untrusted caller would force-
    // approve another session's gated tool call with zero ownership check.
    if (!id || pending.id !== id) return false
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
