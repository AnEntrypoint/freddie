const _windows = new Map()
export function record(provider, e) {
    const w = _windows.get(provider) || { count: 0, until: 0 }
    w.count++
    const m = String(e?.message || e || '').match(/retry.?after[:\s]+(\d+)/i) || String(e?.headers?.get?.('retry-after') || '').match(/(\d+)/)
    if (m) w.until = Date.now() + Number(m[1]) * 1000
    _windows.set(provider, w)
    return w
}
export function shouldThrottle(provider) { const w = _windows.get(provider); return w ? Date.now() < w.until : false }
export function clear(provider) { _windows.delete(provider) }
export function snapshot() { return Object.fromEntries(_windows) }
