/**
 * Shared event bus for real-time session events.
 *
 * Emits typed events (session.created, session.start, message.append,
 * assistant.delta, tool.start, tool.end, session.end, session.error,
 * status.update) that the WebSocket plugin broadcasts to connected clients.
 *
 * Imported by both the agent machine (producer) and the gui-events plugin
 * (consumer). Uses a simple EventEmitter pattern — no external deps.
 */

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event).push(fn);
  return () => off(event, fn);
}

export function off(event, fn) {
  const arr = listeners.get(event);
  if (!arr) return;
  const idx = arr.indexOf(fn);
  if (idx >= 0) arr.splice(idx, 1);
}

export function emit(event, data) {
  const arr = listeners.get(event);
  if (!arr) return;
  for (const fn of arr) {
    try { fn(data); } catch (e) { /* best-effort, don't let one listener break others */ }
  }
}

export function listListeners() {
  const out = {};
  for (const [k, v] of listeners) out[k] = v.length;
  return out;
}