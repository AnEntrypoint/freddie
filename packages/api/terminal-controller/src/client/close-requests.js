const PREFIX = 'freddie.terminal.close.v1.'
const IDENTITY = /^[\w-]{1,128}$/u

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

  pending() {
    return [...this.requests.values()]
  }

  save(request) {
    this.requests.set(request.id, request)
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(PREFIX + request.id, JSON.stringify(request))
    } catch (error) {
      console.error('Terminal cleanup persistence failed:', error)
    }
  }

  remove(id) {
    this.requests.delete(id)
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(PREFIX + id)
    } catch (error) {
      console.error('Terminal cleanup persistence failed:', error)
    }
  }

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

function isRequest(value) {
  if (typeof value !== 'object' || value === null) return false
  const request = value
  return typeof request.sessionId === 'string' && request.sessionId.length > 0
    && typeof request.id === 'string' && IDENTITY.test(request.id)
    && typeof request.title === 'string'
}
