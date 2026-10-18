const CONNECTION_DEFAULTS = {
  backoffBaseMs: 500,
  backoffFactor: 2,
  backoffMaxMs: 10_000,
  streamOpenTimeoutMs: 3_000,
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const t = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
    function done() {
      clearTimeout(t)
      signal.removeEventListener('abort', done)
      resolve()
    }
  })
}

export class ConnectionController {
  generation = 0
  attempt = 0
  current = null
  backoff = null
  running = false
  lastState = null

  constructor(
    api,
    sinks = {},
    config = {},
  ) {
    this.api = api
    this.sinks = sinks
    this.config = { ...CONNECTION_DEFAULTS, ...config }
  }

  start() {
    if (this.running) return
    this.running = true
    void this.loop()
  }

  stop() {
    this.running = false
    this.current?.abort()
    this.current = null
    this.backoff?.abort()
    this.backoff = null
  }

  backoffDelay(attempt) {
    const { backoffBaseMs, backoffFactor, backoffMaxMs } = this.config
    const cap = Math.min(backoffMaxMs, backoffBaseMs * backoffFactor ** Math.max(0, attempt - 1))
    return cap / 2 + Math.random() * (cap / 2)
  }

  isRunning() {
    return this.running
  }

  isGenerationActive(controller) {
    return this.isRunning() && !controller.signal.aborted
  }

  async loop() {
    while (this.running) {
      const gen = ++this.generation
      const ac = new AbortController()
      this.current = ac

      let muxOpened = () => {}
      let hostOpened = () => {}
      const streamsOpen = Promise.all([
        new Promise((resolve) => { muxOpened = resolve }),
        new Promise((resolve) => { hostOpened = resolve }),
      ])

      let finishGeneration = () => {}
      const failed = new Promise((resolve) => {
        let finished = false
        finishGeneration = () => {
          if (finished) return
          finished = true
          if (gen === this.generation && !ac.signal.aborted) ac.abort()
          resolve()
        }
        void this.pumpStream(this.api.events.mux({}, ac.signal, muxOpened), this.sinks.onMuxEnvelope, finishGeneration)
        void this.pumpStream(this.api.events.host({}, ac.signal, hostOpened), this.sinks.onHostEnvelope, finishGeneration)
      })

      try {
        const timeout = new AbortController()
        const [description, streamsReady] = await Promise.all([
          this.api.host.describe({}),
          Promise.race([
            streamsOpen.then(() => true),
            sleep(this.config.streamOpenTimeoutMs, timeout.signal).then(() => false),
          ]),
        ])
        timeout.abort()
        if (!streamsReady) throw new Error('stream readiness timed out')
        const descriptionResult = description.result
        if (!descriptionResult.ok) {
          throw new Error(`host.describe failed: ${descriptionResult.error.code}: ${descriptionResult.error.message}`)
        }
        if (ac.signal.aborted) throw new Error('generation aborted during readiness handshake')
        this.attempt = 0
        this.emitState('connected')
        if (this.isGenerationActive(ac)) {
          this.callSink(() => { this.sinks.onConnected?.(descriptionResult.value) })
        }
      } catch {
        finishGeneration()
      }

      await failed
      if (!this.isRunning()) return
      this.emitState('reconnecting')
      this.attempt += 1
      console.warn(`[web-runtime] connection lost, retry #${this.attempt}`)
      const backoff = new AbortController()
      this.backoff = backoff
      await sleep(this.backoffDelay(this.attempt), backoff.signal)
      if (this.backoff === backoff) this.backoff = null
    }
  }

  emitState(state) {
    if (this.lastState === state) return
    this.lastState = state
    this.callSink(() => this.sinks.onStateChange?.(state))
  }

  async pumpStream(
    stream,
    sink,
    onEnd,
  ) {
    try {
      for await (const envelope of stream) {
        if (envelope.payload.type === 'stream/error') break
        if (sink !== undefined) this.callSink(() => { sink(envelope) })
      }
    } catch {
    }
    onEnd()
  }

  callSink(fn) {
    try {
      fn()
    } catch (error) {
      console.error('[web-runtime] connection sink threw:', error)
    }
  }
}
