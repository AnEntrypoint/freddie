export class SessionPreparations {
  entries = new Map()

  constructor(capacity) {
    this.capacity = capacity
  }

  has(id) {
    return this.entries.has(id)
  }

  async inspect(id, load, signal) {
    const entry = this.entryFor(id, load)
    const loaded = signal === undefined
      ? await entry.result
      : await observeQueuedAbort(entry.result, signal)
    const source = entry.source ?? loaded
    if (this.entries.get(id) === entry && entry.phase === 'ready') this.touch(entry)
    return source
  }

  async reserve(id, load, commit, signal) {
    const entry = this.entryFor(id, load)
    await (signal === undefined ? entry.result : observeQueuedAbort(entry.result, signal))
    while (this.entries.get(id) === entry && entry.phase !== 'ready') {
      const settled = entry.reservationSettled
      /* v8 ignore next */
      if (settled === undefined) throw new Error(`session "${id}" preparation lost its reservation waiter`)
      if (signal === undefined) await settled
      else await observeQueuedAbort(settled, signal)
    }
    if (this.entries.get(id) !== entry) return undefined
    const source = entry.source
    const reservationSettled = Promise.withResolvers()
    entry.phase = 'committing'
    entry.reservationSettled = reservationSettled.promise
    entry.settleReservation = reservationSettled.resolve
    let committed
    try {
      committed = await commit(source)
    } catch (error) {
      this.remove(entry)
      throw error
    }
    if (committed === undefined) {
      this.remove(entry)
      return undefined
    }
    entry.source = committed.source
    try {
      signal?.throwIfAborted()
    } catch (error) {
      this.makeReady(entry)
      throw error
    }
    if (this.entries.get(id) !== entry) return undefined
    const reservation = {
      entry,
      source: committed.source,
      state: committed.state,
    }
    entry.phase = 'reserved'
    entry.reservation = reservation
    return reservation
  }

  reservationFor(session) {
    const entry = this.entries.get(session.id)
    if (entry === undefined) return undefined
    if (entry.phase === 'reserved'
      && entry.source?.session === session
      && entry.reservation !== undefined) {
      return entry.reservation
    }
    throw new Error(`cannot publish session "${session.id}": persisted state already owns this identity`)
  }

  attach(reservation) {
    const { entry } = reservation
    if (this.entries.get(entry.id) !== entry || entry.reservation !== reservation) {
      throw new Error(`session "${entry.id}" preparation is no longer reserved`)
    }
    this.remove(entry)
  }

  discard(reservation) {
    const { entry } = reservation
    if (this.entries.get(entry.id) !== entry || entry.reservation !== reservation) return
    this.remove(entry)
  }

  release(reservation, reusable) {
    const { entry } = reservation
    if (this.entries.get(entry.id) !== entry
      || entry.reservation !== reservation
      || entry.phase !== 'reserved') return
    if (!reusable) {
      this.remove(entry)
      return
    }
    delete entry.reservation
    this.makeReady(entry)
  }

  invalidate(id) {
    const entry = this.entries.get(id)
    if (entry !== undefined) this.remove(entry)
  }

  discardReady(id, expected) {
    const entry = this.entries.get(id)
    if (entry === undefined || entry.source !== expected) return 'missing'
    if (entry.phase !== 'ready') return 'retained'
    this.remove(entry)
    return 'discarded'
  }

  assertWritable(id) {
    const phase = this.entries.get(id)?.phase
    if (phase === 'committing' || phase === 'reserved') {
      throw new Error(`cannot append session "${id}" while its persisted preparation is reserved`)
    }
  }

  takeReady(id) {
    const entry = this.entries.get(id)
    if (entry === undefined || entry.phase !== 'ready' || entry.source === undefined) return undefined
    this.remove(entry)
    return entry.source
  }

  entryFor(id, load) {
    const existing = this.entries.get(id)
    if (existing !== undefined) return existing
    const deferred = Promise.withResolvers()
    const entry = {
      id,
      result: deferred.promise,
      phase: 'loading',
    }
    this.entries.set(id, entry)
    let loading
    try {
      loading = load()
    } catch (error) {
      this.remove(entry)
      deferred.reject(error)
      return entry
    }
    void loading.then((source) => {
      if (this.entries.get(id) === entry) {
        entry.source = source
        this.makeReady(entry)
      }
      deferred.resolve(source)
    }, (error) => {
      this.remove(entry)
      deferred.reject(error)
    })
    return entry
  }

  makeReady(entry) {
    if (this.entries.get(entry.id) !== entry) return
    entry.phase = 'ready'
    const settle = entry.settleReservation
    delete entry.reservationSettled
    delete entry.settleReservation
    settle?.()
    this.touch(entry)
  }

  remove(entry) {
    if (this.entries.get(entry.id) !== entry) return
    this.entries.delete(entry.id)
    const settle = entry.settleReservation
    delete entry.reservationSettled
    delete entry.settleReservation
    settle?.()
  }

  touch(entry) {
    this.entries.delete(entry.id)
    this.entries.set(entry.id, entry)
    let readyCount = 0
    for (const candidate of this.entries.values()) {
      if (candidate.phase === 'ready') readyCount += 1
    }
    if (readyCount <= this.capacity) return
    for (const [id, candidate] of this.entries) {
      if (candidate.phase !== 'ready') continue
      this.entries.delete(id)
      return
    }
  }
}

export function observeQueuedAbort(operation, signal, started = () => false) {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      callback()
    }
    const onAbort = () => {
      if (started()) return
      finish(() => {
        try {
          signal.throwIfAborted()
        } catch (reason) {
          rejectObservation(reject, reason)
          return
        }
        /* v8 ignore next */
        reject(new Error('queued observation abort event lacked an aborted signal'))
      })
    }
    signal.addEventListener('abort', onAbort, { once: true })
    operation.then(
      (value) => { finish(() => { resolve(value) }) },
      (reason) => {
        finish(() => { rejectObservation(reject, reason) })
      },
    )
    if (signal.aborted) onAbort()
  })
}

function rejectObservation(reject, reason) {
  reject(reason)
}
