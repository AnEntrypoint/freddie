const handoffCursor = new WeakMap()

export class SessionTelemetryCoordinator {
  #adopted = new Set()
  #chunkSeen = new WeakMap()
  #ctx
  #backend

  constructor(ctx, backend, capture = 'live') {
    this.#ctx = ctx
    this.#backend = backend
    if (capture === 'live') {
      ctx.on('session/created', (session) => {
        this.#adopt(session)
      })
      ctx.on('session/disposed', (session) => {
        this.#contain(() => {
          if (!this.#adopted.delete(session)) return
          this.#deliver(session, { record: this.#redact(shutdownRecord(session)) })
        })
      })
      ctx.on('session/event', (session, event) => {
        this.#contain(() => {
          this.#captureEvent(session, event)
        })
      })
      ctx.on('session/flush', (session) => {
        this.#contain(() => {
          this.#hintFlush(session)
        })
      })
      ctx.on('agent/error', ({ agent, turn, step, error }) => {
        this.#contain(() => {
          this.#relayAgentError(agent, turn, step, error)
        })
      })
      for (const session of ctx.sessions.list()) {
        this.#adopt(session)
      }
    }
    ctx.effect(() => async () => {
      for (const session of this.#adopted) {
        this.#contain(() => {
          this.#deliver(session, { record: this.#redact(shutdownRecord(session)) })
        })
      }
      try {
        await this.#backend.shutdown()
      } catch (error) {
        this.#ctx.logger.warn(`telemetry: backend shutdown failed: ${String(error)}`)
      }
    }, 'telemetry capture')
  }

  captureSession(session, throughSeq) {
    const cursor = handoffCursor.get(session) ?? session.firstLiveSeq - 1
    for (const event of session.events) {
      if (throughSeq !== undefined && event.seq > throughSeq) break
      this.#contain(() => {
        if (event.seq <= cursor) this.#track(session, event)
        else this.#captureEvent(session, event)
      })
    }
  }

  #adopt(session) {
    if (this.#adopted.has(session)) return
    this.#adopted.add(session)
    this.captureSession(session)
  }

  #track(session, event) {
    if (event.type === 'assistant/chunk') {
      this.#seen(session).add(`${event.data.turn}:${event.data.step}`)
    }
  }

  #captureEvent(session, event) {
    if (event.type === 'assistant/chunk') {
      const key = `${event.data.turn}:${event.data.step}`
      const seen = this.#seen(session)
      if (seen.has(key)) return
      seen.add(key)
    }
    this.#deliver(session, {
      record: this.#redact({
        channel: 'ledger',
        time: event.time,
        severity: severityOf(event),
        attributes: identityOf(session, event),
        body: structuredClone(event.data),
      }),
      seq: event.seq,
    })
  }

  #redact(record) {
    return this.#ctx.waterfall('session-telemetry/record', record, () => record)
  }

  #deliver(session, pending) {
    this.#backend.emit(pending.record)
    if (pending.seq !== undefined) handoffCursor.set(session, pending.seq)
  }

  #hintFlush(session) {
    if (this.#adopted.has(session)) this.#backend.flush?.()
  }

  #relayAgentError(agent, turn, step, error) {
    const detail = errorDetail(error)
    this.#deliver(agent.session, {
      record: this.#redact({
        channel: 'ops',
        time: Date.now(),
        severity: 'error',
        attributes: {
          'telemetry.op': 'agent-error',
          'session.id': String(agent.session.id),
          'agent.id': agent.id,
          'error.name': detail.name,
          turn,
          step,
        },
        body: detail,
      }),
    })
  }

  #seen(session) {
    let set = this.#chunkSeen.get(session)
    if (!set) this.#chunkSeen.set(session, set = new Set())
    return set
  }

  #contain(step) {
    try {
      step()
    } catch (error) {
      this.#ctx.logger.warn(`telemetry: capture step failed: ${String(error)}`)
    }
  }
}

function shutdownRecord(session) {
  return {
    channel: 'ops',
    time: Date.now(),
    severity: 'info',
    attributes: { 'telemetry.op': 'shutdown', 'session.id': String(session.id) },
    body: { op: 'shutdown' },
  }
}

function severityOf(event) {
  switch (event.type) {
    case 'tool/result':
      return event.data.message.content[0].isError === true ? 'error' : 'info'
    case 'turn/end':
      return event.data.reason.kind === 'error' ? 'error' : 'info'
    default:
      return 'info'
  }
}

function errorDetail(error) {
  const normalized = error instanceof Error ? error : new Error(String(error))
  return { name: normalized.name, message: normalized.message }
}

function identityOf(session, event) {
  const attributes = {
    'session.id': String(session.id),
    'event.type': event.type,
    'event.seq': event.seq,
  }
  const { cwd, parentSession, seedLength } = session.header
  if (cwd !== undefined) attributes['session.cwd'] = cwd
  if (parentSession !== undefined) attributes['session.parent_id'] = String(parentSession)
  if (seedLength !== undefined) attributes['session.seed_length'] = seedLength
  return attributes
}
