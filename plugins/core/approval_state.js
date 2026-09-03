// In-memory state for YOLO/AFK/auto-approved approval policies.
// Browser-compatible: Map-based, no filesystem dependencies.
// Called from the agent loop (src/agent/machine.js) and the CLI REPL
// (src/cli/interactive.js) via slash commands /yolo and /afk.

import { telemetry } from '../../src/observability/telemetry.js';

const _yolo = new Map()       // sessionId -> boolean
const _afk = new Map()        // sessionId -> boolean
const _autoApproved = new Map() // sessionId -> Set of action names

export function isYolo(sessionId) {
    return _yolo.get(sessionId) === true
}

export function setYolo(sessionId, enabled) {
    if (enabled) _yolo.set(sessionId, true)
    else _yolo.delete(sessionId)
    telemetry.yoloToggled({ session_id: sessionId, enabled: !!enabled })
}

export function isAfk(sessionId) {
    return _afk.get(sessionId) === true
}

export function setAfk(sessionId, enabled) {
    if (enabled) _afk.set(sessionId, true)
    else _afk.delete(sessionId)
    telemetry.afkToggled({ session_id: sessionId, enabled: !!enabled })
}

export function getAutoApprovedActions(sessionId) {
    return _autoApproved.get(sessionId) || new Set()
}

export function addAutoApprovedAction(sessionId, action) {
    if (!_autoApproved.has(sessionId)) _autoApproved.set(sessionId, new Set())
    _autoApproved.get(sessionId).add(action)
}

/**
 * Returns true when the action should be auto-approved for this session —
 * either YOLO/AFK is active (blanket), or the specific action was previously
 * approved for the session.
 */
export function isAutoApproved(sessionId, action) {
    if (!sessionId) return false
    if (isYolo(sessionId) || isAfk(sessionId)) return true
    const set = _autoApproved.get(sessionId)
    return set ? set.has(action) : false
}