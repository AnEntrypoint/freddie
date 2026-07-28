/**
 * In-memory notification queue for async events (background task/subagent
 * completion, etc.) delivered to the LLM as system-reminder injections.
 *
 * Browser-safe: all state in-memory (Array + Set), no filesystem or Node.js
 * specific APIs.
 */

class NotificationManager {
  constructor() {
    this._queue = [];
    this._delivered = new Set();
  }

  /**
   * Push a notification to the queue.
   * @param {string} type - notification type (e.g. 'task_complete', 'subagent_complete')
   * @param {string} message - human-readable message
   * @param {'info'|'warning'|'error'} [severity='info'] - severity level
   * @returns {string} notification id
   */
  notify(type, message, severity = 'info') {
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this._queue.push({ id, type, message, severity, timestamp: Date.now(), delivered: false });
    return id;
  }

  /**
   * Deliver pending notifications (up to 4 per call).
   * Marks delivered notifications so they are not returned again.
   * @returns {{ id: string, type: string, message: string }[]}
   */
  deliverPending() {
    const pending = this._queue.filter(n => !n.delivered).slice(0, 4);
    for (const n of pending) n.delivered = true;
    return pending.map(n => ({ id: n.id, type: n.type, message: n.message }));
  }

  /**
   * Check if any undelivered notifications exist.
   * @returns {boolean}
   */
  hasPending() {
    return this._queue.some(n => !n.delivered);
  }

  /**
   * Remove all delivered notifications from the queue to prevent unbounded
   * growth. Call periodically (e.g. on session end).
   */
  clearDelivered() {
    this._queue = this._queue.filter(n => !n.delivered);
  }

  /**
   * Reset to empty state (for testing).
   */
  reset() {
    this._queue = [];
    this._delivered = new Set();
  }

  /**
   * Return all notifications (most recent first).
   * @returns {{ id: string, type: string, message: string, severity: string, timestamp: number }[]}
   */
  getAll() {
    return [...this._queue].reverse();
  }

  /**
   * Dismiss a single notification by id.
   * @param {string} id
   * @returns {boolean} true if a notification was removed
   */
  dismiss(id) {
    const idx = this._queue.findIndex(n => n.id === id);
    if (idx < 0) return false;
    this._queue.splice(idx, 1);
    return true;
  }

  /**
   * Dismiss all delivered notifications.
   */
  dismissAll() {
    this._queue = this._queue.filter(n => !n.delivered);
  }
}

export const notificationManager = new NotificationManager();