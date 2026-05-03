const _subscribers = new Set()
export function addSubscriber(handler) { _subscribers.add(handler); return () => _subscribers.delete(handler) }
export const broadcastHook = async (reply) => { for (const s of _subscribers) try { s(reply) } catch {} return reply }
