// API-key rotation pool: round-robins across a provider's configured keys and
// temporarily blacklists ones that just failed.
import { parseEnvKeyList } from '../utils.js'

const COOLDOWN_MS = 60_000
const _state = new Map()

function entry(provider) {
    if (_state.has(provider)) return _state.get(provider)
    const keys = parseEnvKeyList(provider.toUpperCase() + '_API_KEYS')
    const single = process.env[provider.toUpperCase() + '_API_KEY']
    const all = keys.length ? keys : (single ? [single] : [])
    const e = { keys: all, idx: 0, blacklist: new Map() }
    _state.set(provider, e)
    return e
}
export function next(provider) {
    const e = entry(provider)
    if (!e.keys.length) return null
    for (let i = 0; i < e.keys.length; i++) {
        const k = e.keys[(e.idx + i) % e.keys.length]
        const until = e.blacklist.get(k) || 0
        if (Date.now() >= until) { e.idx = (e.idx + i + 1) % e.keys.length; return k }
    }
    return null
}
export function markFailure(provider, key) {
    entry(provider).blacklist.set(key, Date.now() + COOLDOWN_MS)
}
export function clearBlacklist(provider) { entry(provider).blacklist.clear() }
export function listKeys(provider) { return [...entry(provider).keys] }
export function resetForTests() { _state.clear() }
