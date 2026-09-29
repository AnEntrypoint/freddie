
class Entry {
  state = 'cold'
  commands = []
  epoch = 0
  lastError
  waiters = []
}

export class CommandDirectory {
  entries = new Map()

  constructor(fetchCommands) {
    this.fetchCommands = fetchCommands
  }

  status(sessionId) {
    return this.entries.get(sessionId)?.state ?? 'cold'
  }

  resolve(sessionId, name) {
    const entry = this.entries.get(sessionId)
    if (entry === undefined || entry.state !== 'ready') return undefined
    return entry.commands.find(c => c.name === name)
  }

  invalidateAll() {
    for (const key of this.entries.keys()) void this.refresh(key)
  }

  resetConnected() {
    for (const [key, entry] of this.entries) {
      entry.state = 'cold'
      entry.commands = []
      void this.refresh(key)
    }
  }

  warm(sessionId) {
    const entry = this.entry(sessionId)
    if (entry.state === 'cold' || entry.state === 'failed') void this.refresh(sessionId)
  }

  async refresh(sessionId) {
    const entry = this.entry(sessionId)
    const epoch = ++entry.epoch
    if (entry.state !== 'ready') entry.state = 'pending'
    try {
      const commands = await this.fetchCommands(sessionId)
      if (epoch !== entry.epoch) return
      entry.commands = commands
      entry.state = 'ready'
      entry.lastError = undefined
    } catch (error) {
      if (epoch !== entry.epoch) return
      entry.commands = []
      entry.state = 'failed'
      entry.lastError = error
    } finally {
      if (epoch === entry.epoch) notifyWaiters(entry)
    }
  }

  async ensureReady(sessionId, signal) {
    const entry = this.entry(sessionId)
    while (true) {
      if (entry.state === 'ready') return entry.commands
      if (entry.state !== 'pending') void this.refresh(sessionId)
      await settled(entry, signal)
      if (entry.state === 'failed') {
        throw new Error(`command directory warmup failed: ${entry.lastError instanceof Error ? entry.lastError.message : String(entry.lastError)}`)
      }
    }
  }

  entry(sessionId) {
    let entry = this.entries.get(sessionId)
    if (entry === undefined) {
      entry = new Entry()
      this.entries.set(sessionId, entry)
    }
    return entry
  }
}

function settled(entry, signal) {
  if (signal.aborted) return Promise.reject(abortReason(signal))
  return new Promise((resolve, reject) => {
    const waiter = () => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }
    const onAbort = () => {
      entry.waiters = entry.waiters.filter(w => w !== waiter)
      reject(abortReason(signal))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    entry.waiters.push(waiter)
  })
}

function notifyWaiters(entry) {
  const woken = entry.waiters
  entry.waiters = []
  for (const wake of woken) wake()
}

function abortReason(signal) {
  return signal.reason instanceof Error ? signal.reason : new Error('command directory wait aborted')
}
