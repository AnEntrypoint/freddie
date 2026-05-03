import { getConfigValue } from '../config.js'

const _allowed = new Map()
const _denied = new Map()

export function isAlwaysAllow(tool) {
    const list = getConfigValue('acp.always_allow', []) || []
    return list.includes(tool)
}
export function isAlwaysDeny(tool) {
    const list = getConfigValue('acp.always_deny', []) || []
    return list.includes(tool)
}
export function rememberAllow(sessionId, tool) {
    if (!_allowed.has(sessionId)) _allowed.set(sessionId, new Set())
    _allowed.get(sessionId).add(tool)
}
export function rememberDeny(sessionId, tool) {
    if (!_denied.has(sessionId)) _denied.set(sessionId, new Set())
    _denied.get(sessionId).add(tool)
}
export function checkPermission(sessionId, tool) {
    if (isAlwaysDeny(tool)) return 'deny'
    if (isAlwaysAllow(tool)) return 'allow'
    if (_denied.get(sessionId)?.has(tool)) return 'deny'
    if (_allowed.get(sessionId)?.has(tool)) return 'allow'
    return 'ask'
}
export function resetForTests() { _allowed.clear(); _denied.clear() }
