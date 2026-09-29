/** Unfinished close requests survive reload independently of the removed sidebar tabs. */
const PREFIX = 'freddie.terminal.close.v1.'
const IDENTITY = /^[\w-]{1,128}$/u

/** Each request has its own storage key, so other browser windows cannot overwrite its cleanup. */
export class TerminalCloseRequests {
  requests = new Map()

  constructor() {
    try {
      if (typeof localStorage === 'undefined') return
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index)
        if (key?.startsWith(PREFIX) === true) this.load(key)
      }
    } catch (error) {
      console.error('Terminal cleanup recovery failed:', error)
    }
  }

  /**
   * Read cleanup work still awaiting Host confirmation.
   * @returns {readonly import('../types.js').TerminalCloseRequest[]} unfinished requests owned by this browser instance.
   */
  pending() {
    return [...this.requests.values()]
  }

  /**
   * Retain cleanup across reload before removing a tab.
   * @param {import('../types.js').TerminalCloseRequest} request - close intent to save before removing its tab.
   * @returns {void}
   */
  save(request) {
    this.requests.set(request.id, request)
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(PREFIX + request.id, JSON.stringify(request))
    } catch (error) {
      console.error('Terminal cleanup persistence failed:', error)
    }
  }

  /**
   * Forget confirmed cleanup in memory and browser storage.
   * @param {import('../types.js').WebTerminalId} id - terminal whose Host cleanup succeeded.
   * @returns {void}
   */
  remove(id) {
    this.requests.delete(id)
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(PREFIX + id)
    } catch (error) {
      console.error('Terminal cleanup persistence failed:', error)
    }
  }

  /**
   * @param {string} key - storage key under this prefix.
   * @returns {void}
   */
  load(key) {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return
      const parsed = JSON.parse(raw)
      if (!isRequest(parsed) || key !== PREFIX + parsed.id) throw new Error('Invalid terminal cleanup request')
      this.requests.set(parsed.id, parsed)
    } catch (error) {
      console.error('Terminal cleanup recovery failed:', error)
    }
  }
}

/**
 * @param {unknown} value - parsed storage entry.
 * @returns {value is import('../types.js').TerminalCloseRequest} whether every field survived the round trip.
 */
function isRequest(value) {
  if (typeof value !== 'object' || value === null) return false
  const request = value
  return typeof request.sessionId === 'string' && request.sessionId.length > 0
    && typeof request.id === 'string' && IDENTITY.test(request.id)
    && typeof request.title === 'string'
}
