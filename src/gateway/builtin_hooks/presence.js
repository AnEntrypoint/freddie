const _presence = new Map()
export const presenceInboundHook = async (msg) => { if (msg?.from) _presence.set(msg.from, Date.now()); return msg }
export function isOnline(from, withinMs = 5 * 60_000) { const ts = _presence.get(from) || 0; return Date.now() - ts < withinMs }
export function presenceMap() { return Object.fromEntries(_presence) }
