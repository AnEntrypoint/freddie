function awaitOperation(operation, signal) {
  return new Promise((resolve, reject) => {
    const aborted = () => {
      reject(signal.reason instanceof Error
        ? signal.reason
        : new Error('browser operation canceled', { cause: signal.reason }))
    }
    signal.addEventListener('abort', aborted, { once: true })
    void operation.then((value) => {
      signal.removeEventListener('abort', aborted)
      resolve(value)
    }, (error) => {
      signal.removeEventListener('abort', aborted)
      reject(error instanceof Error ? error : new Error(String(error), { cause: error }))
    })
  })
}

const trackSettlementOnly = () => {}
const leaveFailureToLaterConsumers = () => {}

export class SessionResources {
  #entries = new Map()
  #ownerCleanups = new Map()
  #disposedOwners = new WeakSet()
  #disposing

  constructor(ctx, options) {
    this.ctx = ctx
    this.options = options
  }

  available(agent) {
    return this.#disposing === undefined && !this.#disposedOwners.has(agent)
      && this.ctx.get('agents')?.get(agent.id) === agent
      && (this.#entries.has(agent) || !this.options.exclusive || this.#entries.size === 0)
  }

  async get(agent, signal) {
    signal?.throwIfAborted()
    const entry = this.#entry(agent)
    const resource = await (signal === undefined ? entry.ready : awaitOperation(entry.ready, signal))
    signal?.throwIfAborted()
    entry.controller.signal.throwIfAborted()
    return resource.value
  }

  run(agent, signal, operation) {
    signal.throwIfAborted()
    const entry = this.#entry(agent)
    const combined = AbortSignal.any([signal, entry.controller.signal])
    const releaseDisposed = () => {
      const reason = signal.reason
      if (reason === null || reason === undefined || reason.kind !== 'disposed') return
      this.#disposedOwners.add(agent)
      void this.#closeEntry(agent, entry).catch((error) => {
        this.ctx.logger.warn(`${this.options.label}: browser cleanup during Session cancellation failed: ${String(error)}`)
      })
    }
    signal.addEventListener('abort', releaseDisposed, { once: true })
    const task = entry.tail.then(async () => {
      combined.throwIfAborted()
      const resource = await awaitOperation(entry.ready, combined)
      combined.throwIfAborted()
      const result = await operation(resource.value, combined)
      combined.throwIfAborted()
      return result
    }).finally(() => {
      signal.removeEventListener('abort', releaseDisposed)
    })
    entry.tail = task.then(trackSettlementOnly, trackSettlementOnly)
    return task
  }

  dispose() {
    return this.#disposing ??= Promise.resolve().then(async () => {
      const settled = await Promise.allSettled(
        [...this.#entries].map(([agent, entry]) => this.#closeEntry(agent, entry)),
      )
      const errors = settled.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
      if (errors.length > 0) throw new AggregateError(errors, `${this.options.label}: browser cleanup failed`)
      await Promise.all([...this.#ownerCleanups.values()].map(close => close()))
    })
  }

  #entry(agent) {
    if (this.#disposing !== undefined
      || this.#disposedOwners.has(agent)
      || this.ctx.get('agents')?.get(agent.id) !== agent) {
      throw new Error(`${this.options.label}: Session is not a live browser owner`)
    }
    const current = this.#entries.get(agent)
    if (current !== undefined) return current
    if (this.options.exclusive && this.#entries.size > 0) {
      throw new Error(`${this.options.label}: attached browser is already reserved by another Session`)
    }
    if (!this.#ownerCleanups.has(agent)) {
      const cleanup = agent.ctx.effect(() => async () => {
        this.#disposedOwners.add(agent)
        const owned = this.#entries.get(agent)
        if (owned !== undefined) await this.#closeEntry(agent, owned)
        this.#ownerCleanups.delete(agent)
      }, `${this.options.label}.session`)
      this.#ownerCleanups.set(agent, cleanup)
    }
    const controller = new AbortController()
    const entry = {
      controller,
      ready: Promise.resolve().then(() => {
        controller.signal.throwIfAborted()
        return this.options.open(agent, controller.signal)
      }).catch((error) => {
        this.#entries.delete(agent)
        throw error
      }),
      tail: Promise.resolve(),
    }
    void entry.ready.catch(leaveFailureToLaterConsumers)
    this.#entries.set(agent, entry)
    return entry
  }

  #closeEntry(agent, entry) {
    return entry.closing ??= Promise.resolve().then(async () => {
      entry.controller.abort(new Error(`${this.options.label}: Session browser is closing`))
      const resource = await entry.ready.catch(() => undefined)
      try {
        await resource?.close()
      } finally {
        await entry.tail
      }
      this.#entries.delete(agent)
    })
  }
}
