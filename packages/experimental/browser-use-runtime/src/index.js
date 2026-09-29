/**
 * Browser resource ownership for the experimental providers. Resources belong
 * to an exact live Agent activation and never transfer to a resumed Session.
 * @module @freddie/freddie-experimental-browser-use-runtime
 */

/**
 * One provider-owned browser or connection and its quiescent cleanup.
 * @typedef {object} OwnedSessionResource
 * @property {T} value - provider-private handle exposed to operations.
 * @property {() => Promise<void>} close - stop admission, interrupt pending
 *   operations, and await resource shutdown.
 * @template T
 */

/**
 * Resource creation and attachment ownership selected by one provider.
 * @typedef {object} SessionResourceOptions
 * @property {string} label - provider name included in lifecycle diagnostics.
 * @property {boolean} exclusive - reserve one existing browser for at most one
 *   live Session.
 * @property {(agent: import('@freddie/freddie-agent').Agent, signal: AbortSignal)
 *   => Promise<OwnedSessionResource<T>>} open - acquire one resource; reject only
 *   after rolling back partial acquisition.
 * @template T
 */

/**
 * One live owner's acquisition, operation queue, and closing promise.
 * @typedef {object} SessionResourceEntry
 * @property {AbortController} controller - aborts when this owner's resource closes.
 * @property {Promise<OwnedSessionResource<T>>} ready - one acquisition attempt.
 * @property {Promise<void>} tail - settles when every queued operation settles.
 * @property {Promise<void>} [closing] - the single shared close for this entry.
 * @template T
 */

/**
 * Stop a caller's wait while retaining handlers on the resource owner's work.
 * @param {Promise<T>} operation - promise whose settlement ends the wait.
 * @param {AbortSignal} signal - caller cancellation.
 * @returns {Promise<T>} the operation result, rejected on cancellation.
 * @template T
 */
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

/**
 * Lazily acquires one resource per live Session and serializes its operations.
 * Provider disposal closes connections before awaiting operations, allowing
 * transport closure to interrupt work whose upstream API has no abort support.
 * @template T
 */
export class SessionResources {
  /** @type {Map<import('@freddie/freddie-agent').Agent, SessionResourceEntry<T>>} */
  #entries = new Map()
  /** @type {Map<import('@freddie/freddie-agent').Agent, () => Promise<void>>} */
  #ownerCleanups = new Map()
  /** @type {WeakSet<import('@freddie/freddie-agent').Agent>} */
  #disposedOwners = new WeakSet()
  /** @type {Promise<void> | undefined} */
  #disposing

  /**
   * @param {import('@freddie/cordis').Context} ctx - provider context with the
   *   live Agent registry.
   * @param {SessionResourceOptions<T>} options - provider-owned acquisition and
   *   attachment policy.
   */
  constructor(ctx, options) {
    this.ctx = ctx
    this.options = options
  }

  /**
   * Check admission without reserving or acquiring a browser.
   * @param {import('@freddie/freddie-agent').Agent} agent - exact live Agent
   *   that would own the resource.
   * @returns {boolean} whether this owner can use or acquire the configured browser.
   */
  available(agent) {
    return this.#disposing === undefined && !this.#disposedOwners.has(agent)
      && this.ctx.get('agents')?.get(agent.id) === agent
      && (this.#entries.has(agent) || !this.options.exclusive || this.#entries.size === 0)
  }

  /**
   * Obtain the current activation's resource, acquiring it once when absent.
   * @param {import('@freddie/freddie-agent').Agent} agent - exact live owner,
   *   never merely a durable Session id.
   * @param {AbortSignal} [signal] - optional cancellation of this wait;
   *   acquisition remains Session-owned.
   * @returns {Promise<T>} the provider's resource after acquisition and
   *   ownership checks.
   */
  async get(agent, signal) {
    signal?.throwIfAborted()
    const entry = this.#entry(agent)
    const resource = await (signal === undefined ? entry.ready : awaitOperation(entry.ready, signal))
    signal?.throwIfAborted()
    entry.controller.signal.throwIfAborted()
    return resource.value
  }

  /**
   * Run after earlier operations on this Session settle; other Sessions proceed
   * independently. Cancellation stops this caller's acquisition wait without
   * canceling Session-owned initialization. It reaches an active provider
   * operation and prevents queued work from starting.
   * @param {import('@freddie/freddie-agent').Agent} agent - exact live resource owner.
   * @param {AbortSignal} signal - cancellation for this operation.
   * @param {(resource: T, signal: AbortSignal) => Promise<R>} operation -
   *   provider call, which must retain ownership until its work settles.
   * @returns {Promise<R>} the operation result or its acquisition, cancellation,
   *   or execution failure.
   * @template R
   */
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

  /**
   * Stop new acquisitions and await every acquired resource and owned operation.
   * A failed close retains its entry and rejects disposal, preserving exclusive
   * ownership.
   * @returns {Promise<void>} the shared quiescent disposal promise.
   */
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

  /**
   * @param {import('@freddie/freddie-agent').Agent} agent - exact live owner.
   * @returns {SessionResourceEntry<T>} that owner's entry, created on first use.
   */
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
    /** @type {SessionResourceEntry<T>} */
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

  /**
   * @param {import('@freddie/freddie-agent').Agent} agent - exact live owner.
   * @param {SessionResourceEntry<T>} entry - that owner's entry.
   * @returns {Promise<void>} the entry's single shared close.
   */
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
