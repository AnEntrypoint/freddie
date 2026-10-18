import { singleFlight } from '@freddie/freddie-client-runtime/client'

const EMPTY_ITEMS = new Map()

const INITIAL_VIEW = Object.freeze({
  status: 'cold',
  items: EMPTY_ITEMS,
  error: null,
})

const OK = Object.freeze({ ok: true })

const DISPOSED = Object.freeze({
  ok: false,
  error: Object.freeze({ code: 'disposed', message: 'feedback controller is disposed' }),
})

function describe(code) {
  switch (code) {
    case 'session-not-found': return 'this session is no longer persisted'
    case 'target-not-found': return 'this message is not a persisted assistant message'
    case 'version-conflict': return 'feedback changed elsewhere'
    case 'note-blank': return 'a note must contain a non-whitespace character'
    case 'note-too-large': return 'the note is too long'
    default: return code
  }
}

function fail(code) {
  return { ok: false, error: { code, message: describe(code) } }
}

function carrierFailure(error) {
  return { ok: false, error: { code: error.code, message: error.message } }
}

export class MessageFeedbackController {
  view = INITIAL_VIEW
  listeners = new Set()
  loadPromise = null
  operationTail = Promise.resolve()
  disposed = false

  constructor(remote, sessionId) {
    this.remote = remote
    this.sessionId = sessionId
  }

  getSnapshot = () => this.view

  subscribe = (listener) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  ensure() {
    if (this.view.status === 'ready') return Promise.resolve(OK)
    return this.refresh()
  }

  refresh() {
    if (this.loadPromise !== null) return this.loadPromise
    this.publish({ status: 'loading', items: this.view.items, error: null })
    const pending = this.load()
    this.loadPromise = pending
    return pending.finally(() => { this.loadPromise = null })
  }

  resync() {
    return this.mutate(() => this.refresh(), { seed: false })
  }

  rate(messageId, rating, note) {
    return this.mutate(async () => {
      const observed = this.view.items.get(messageId)
      return await this.putCommitted(messageId, rating, note ?? observed?.note, observed)
    })
  }

  toggle(messageId, rating) {
    return this.mutate(async () => {
      const observed = this.view.items.get(messageId)
      if (observed?.rating === rating) return await this.deleteCommitted(messageId, observed)
      return await this.putCommitted(messageId, rating, observed?.note, observed)
    })
  }

  clearNote(messageId) {
    return this.mutate(async () => {
      const observed = this.view.items.get(messageId)
      if (observed === undefined || observed.note === undefined) return OK
      return await this.putCommitted(messageId, observed.rating, undefined, observed)
    })
  }

  clear(messageId) {
    return this.mutate(async () => {
      const observed = this.view.items.get(messageId)
      if (observed === undefined) return OK
      return await this.deleteCommitted(messageId, observed)
    })
  }

  async putCommitted(messageId, rating, note, observed) {
    const carried = await this.remote.put({
      sessionId: this.sessionId,
      messageId,
      rating,
      ...(note === undefined ? {} : { note }),
      ifVersion: observed?.version ?? null,
    })
    if (!carried.ok) return carrierFailure(carried.error)
    const result = carried.value
    if (result.ok) {
      this.commit(messageId, result.value)
      return OK
    }
    if (result.error.code === 'version-conflict') this.commit(messageId, result.error.current)
    return fail(result.error.code)
  }

  async deleteCommitted(messageId, observed) {
    const carried = await this.remote.delete({
      sessionId: this.sessionId,
      messageId,
      ifVersion: observed.version,
    })
    if (!carried.ok) return carrierFailure(carried.error)
    const result = carried.value
    if (result.ok) {
      this.commit(messageId, null)
      return OK
    }
    if (result.error.code === 'version-conflict') this.commit(messageId, result.error.current)
    return fail(result.error.code)
  }

  dispose() {
    this.disposed = true
    this.listeners.clear()
  }

  load = singleFlight(async () => {
    try {
      const carried = await this.remote.list({ sessionId: this.sessionId })
      if (this.disposed) return OK
      if (!carried.ok) {
        this.publish({ status: 'error', items: this.view.items, error: carried.error.message })
        return carrierFailure(carried.error)
      }
      const result = carried.value
      if (!result.ok) {
        this.publish({ status: 'error', items: this.view.items, error: describe(result.error.code) })
        return fail(result.error.code)
      }
      const items = new Map()
      for (const item of result.value.items) items.set(item.messageId, item)
      this.publish({ status: 'ready', items, error: null })
      return OK
    } catch (error) {
      if (this.disposed) return OK
      const message = error instanceof Error ? error.message : 'message feedback list failed'
      this.publish({ status: 'error', items: this.view.items, error: message })
      return { ok: false, error: { code: 'transport', message } }
    }
  })

  mutate(operation, options = {}) {
    const guarded = async () => {
      if (this.disposed) return DISPOSED
      if (options.seed !== false) {
        const loaded = await this.ensure()
        if (!loaded.ok) return loaded
        if (this.disposed) return DISPOSED
      }
      try {
        return await operation()
      } catch (error) {
        return {
          ok: false,
          error: {
            code: 'transport',
            message: error instanceof Error ? error.message : 'message feedback mutation failed',
          },
        }
      }
    }
    const result = this.operationTail.then(guarded, guarded)
    this.operationTail = result.then(() => undefined)
    return result
  }

  commit(messageId, item) {
    const items = new Map(this.view.items)
    if (item === null) items.delete(messageId)
    else items.set(messageId, item)
    this.publish({ status: 'ready', items, error: null })
  }

  publish(view) {
    this.view = Object.freeze(view)
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (error) {
        console.error('[ui-message-feedback] subscriber threw:', error)
      }
    }
  }
}
