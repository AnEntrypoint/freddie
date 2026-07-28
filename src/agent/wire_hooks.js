/**
 * WireHookBridge — enables client-side hook subscriptions.
 * Clients subscribe to hook events via wire initialize, and the
 * bridge forwards matching events for client-side handling.
 *
 * The bridge is pure in-memory — no persistence, no I/O. Browser-safe.
 * Accessible via `globalThis.__FREDDIE_WIRE_HOOKS__` in browser contexts
 * and via import in Node.js.
 */

// Valid hook event names that can be subscribed to via wire.
const WIRE_HOOK_EVENTS = [
  'preToolCall',
  'postToolCall',
  'onSessionStart',
  'onSessionEnd',
  'onMessageInbound',
  'onMessageOutbound',
  'onPreCompact',
  'onPostCompact',
]

export class WireHookBridge {
  constructor() {
    this._subscriptions = new Map() // eventName -> [{id, callback, timeout}]
    this._idCounter = 0
  }

  /**
   * Subscribe to a hook event.
   * @param {string} eventName — e.g. 'preToolCall', 'postToolCall'
   * @param {function} callback — called with context, returns {decision, ...}
   * @param {object} [opts]
   * @param {number} [opts.timeout=30000] — max ms to wait for client response
   * @returns {string} subscription id
   */
  subscribe(eventName, callback, { timeout = 30000 } = {}) {
    if (!WIRE_HOOK_EVENTS.includes(eventName)) {
      throw new Error(`unknown hook event: ${eventName}. Valid: ${WIRE_HOOK_EVENTS.join(', ')}`)
    }
    const id = `wire-${++this._idCounter}`
    if (!this._subscriptions.has(eventName)) {
      this._subscriptions.set(eventName, [])
    }
    this._subscriptions.get(eventName).push({ id, callback, timeout })
    return id
  }

  /**
   * Unsubscribe from a hook event.
   * @returns {boolean} true if unsubscribed
   */
  unsubscribe(eventName, id) {
    const subs = this._subscriptions.get(eventName)
    if (!subs) return false
    const idx = subs.findIndex(s => s.id === id)
    if (idx === -1) return false
    subs.splice(idx, 1)
    if (subs.length === 0) this._subscriptions.delete(eventName)
    return true
  }

  /**
   * Forward a hook event to all subscribed clients.
   * Fail-open: timeout or error allows the operation to proceed.
   * @returns {Promise<Array<{id, ok, result?, error?}>>}
   */
  async forwardHook(eventName, context) {
    const subs = this._subscriptions.get(eventName)
    if (!subs || subs.length === 0) return []

    const results = []
    for (const sub of subs) {
      try {
        const result = await Promise.race([
          sub.callback(context),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), sub.timeout)
          ),
        ])
        results.push({ id: sub.id, ok: true, result })
      } catch (err) {
        // Fail-open: timeout or error allows the operation to proceed
        results.push({ id: sub.id, ok: false, error: err.message })
      }
    }
    return results
  }

  /**
   * List active subscriptions.
   * @returns {Array<{eventName, id, timeout}>}
   */
  listSubscriptions() {
    const result = []
    for (const [eventName, subs] of this._subscriptions) {
      for (const sub of subs) {
        result.push({ eventName, id: sub.id, timeout: sub.timeout })
      }
    }
    return result
  }

  /** Reset all subscriptions (for tests / new sessions). */
  reset() {
    this._subscriptions.clear()
    this._idCounter = 0
  }

  /** Valid hook event names for wire subscriptions. */
  static get EVENTS() { return WIRE_HOOK_EVENTS }
}

export const wireHookBridge = new WireHookBridge()

// Expose to browser contexts via globalThis so thebird and other browser
// consumers can access the singleton without a module import.
if (typeof globalThis !== 'undefined') {
  globalThis.__FREDDIE_WIRE_HOOKS__ = wireHookBridge
}