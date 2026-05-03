export const CACHE_BREAKPOINT_MAX = 4
export function annotateBreakpoints(messages, { provider = 'anthropic' } = {}) {
    if (provider !== 'anthropic') return messages
    const out = messages.map(m => ({ ...m }))
    const candidates = []
    for (let i = out.length - 1; i >= 0; i--) {
        const r = out[i].role
        if (r === 'system' || r === 'user') candidates.push(i)
        if (candidates.length >= CACHE_BREAKPOINT_MAX) break
    }
    for (const i of candidates.slice(0, CACHE_BREAKPOINT_MAX)) {
        const m = out[i]
        if (typeof m.content === 'string') m.content = [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }]
        else if (Array.isArray(m.content) && m.content.length) m.content[m.content.length - 1] = { ...m.content[m.content.length - 1], cache_control: { type: 'ephemeral' } }
    }
    return out
}
export function countBreakpoints(messages) {
    let n = 0
    for (const m of messages) {
        if (Array.isArray(m.content)) for (const p of m.content) if (p?.cache_control) n++
    }
    return n
}
