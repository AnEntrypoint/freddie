const _callbacks = new Map()
export function on(event, fn) { if (!_callbacks.has(event)) _callbacks.set(event, new Set()); _callbacks.get(event).add(fn); return () => _callbacks.get(event)?.delete(fn) }
export async function emit(event, payload) { const out = []; for (const fn of (_callbacks.get(event) || [])) try { out.push(await fn(payload)) } catch (e) { out.push({ error: String(e?.message || e) }) } return out }
export function listEvents() { return [..._callbacks.keys()] }
export function clearAll() { _callbacks.clear() }
