export function now() { return Date.now() }
export function fmtIso(ms = Date.now()) { return new Date(ms).toISOString() }
const UNITS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }
export function parseDuration(s) {
    if (typeof s === 'number') return s
    const m = String(s).trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)$/i)
    if (!m) throw new Error('bad duration: ' + s)
    return Math.round(Number(m[1]) * UNITS[m[2].toLowerCase()])
}
export function humanizeDuration(ms) {
    const abs = Math.abs(ms); const p = []
    const d = Math.floor(abs / UNITS.d); if (d) p.push(d + 'd')
    const h = Math.floor((abs % UNITS.d) / UNITS.h); if (h) p.push(h + 'h')
    const m = Math.floor((abs % UNITS.h) / UNITS.m); if (m) p.push(m + 'm')
    const s = Math.floor((abs % UNITS.m) / 1000); if (s) p.push(s + 's')
    if (!p.length) p.push((abs % 1000) + 'ms')
    return p.slice(0, 2).join(' ')
}
export function tsRelative(ms, ref = Date.now()) {
    const diff = ref - ms
    if (diff < 60_000) return 'just now'
    if (diff < 3_600_000) return Math.floor(diff / 60_000) + 'm ago'
    if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + 'h ago'
    return Math.floor(diff / 86_400_000) + 'd ago'
}
