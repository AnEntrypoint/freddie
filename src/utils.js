import crypto from 'node:crypto'
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const sleep = (ms) => new Promise(r => setTimeout(r, ms))
export async function retry({ fn, attempts = 3, backoff = 200, factor = 2 }) {
    let last
    for (let i = 0; i < attempts; i++) {
        try { return await fn(i) } catch (e) { last = e; if (i < attempts - 1) await sleep(backoff * Math.pow(factor, i)) }
    }
    throw last
}
export function debounce(fn, ms) {
    let t = null
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
}
export function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex') }
export function randomId(len = 12) { return crypto.randomBytes(len).toString('hex') }
export function deepClone(o) { return JSON.parse(JSON.stringify(o)) }
export function deepMerge(t, s) {
    if (!s || typeof s !== 'object') return t
    for (const k of Object.keys(s)) {
        if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) deepMerge(t[k], s[k])
        else t[k] = s[k]
    }
    return t
}
const SECRET_PATTERNS = [
    /sk-[A-Za-z0-9-_]{20,}/g,
    /ghp_[A-Za-z0-9]{36}/g,
    /xox[baprs]-[A-Za-z0-9-]{10,}/g,
    /AKIA[0-9A-Z]{16}/g,
    /[a-zA-Z0-9._%+-]+:[^@\s]+@[a-zA-Z0-9.-]+/g,
    /Bearer\s+[A-Za-z0-9._-]+/gi,
]
export function redactSecret(s) {
    let out = String(s)
    for (const re of SECRET_PATTERNS) out = out.replace(re, '[REDACTED]')
    return out
}
export function ansiStrip(s) {
    return String(s).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
}
export function fuzzyMatch(needle, hay) {
    needle = String(needle).toLowerCase(); hay = String(hay).toLowerCase()
    let i = 0, score = 0
    for (const c of hay) {
        if (i < needle.length && c === needle[i]) { score += 2 + (score & 1); i++ } else { score = score & ~1 }
    }
    return i === needle.length ? score : 0
}
export function parseEnvKeyList(name) {
    const v = process.env[name]
    if (!v) return []
    return v.split(',').map(x => x.trim()).filter(Boolean)
}
