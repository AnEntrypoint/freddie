import { Service } from '@freddie/cordis'

function carrierFailure(error) {
  return {
    ok: false,
    error: {
      code: 'transport',
      message: error instanceof Error ? error.message : String(error),
      details: {},
    },
  }
}

function unsupported(method) {
  return {
    ok: false,
    error: {
      code: 'unsupported',
      message: `session/${method} streams frames and this Client carries unary calls only`,
      details: { method },
    },
  }
}

export class ClientSessionModel extends Service {
  constructor(ctx, remote) {
    super(ctx, 'sessionModel')
    this.remote = remote
    this.summaries = []
    this.failures = new Map()
    this.listeners = new Set()
    ctx.effect(() => () => { this.listeners.clear() }, 'session-controller.client.listeners')
  }

  subscribe(listener) {
    const entry = { listener }
    this.listeners.add(entry)
    return () => { this.listeners.delete(entry) }
  }

  notify(change) {
    const report = (error) => {
      console.error('session-controller: roster listener threw:', error)
    }
    for (const { listener } of [...this.listeners]) {
      try {
        const settled = listener(change)
        if (settled instanceof Promise) settled.catch(report)
      } catch (error) {
        report(error)
      }
    }
  }

  roster() {
    return [...this.summaries]
  }

  failureFor(sessionId) {
    return this.failures.get(sessionId)
  }

  upsert(summary) {
    const at = this.summaries.findIndex(row => row.sessionId === summary.sessionId)
    if (at < 0) this.summaries.unshift(summary)
    else this.summaries[at] = summary
    this.failures.delete(summary.sessionId)
    this.notify({ type: 'sessions' })
  }

  remove(sessionId) {
    const at = this.summaries.findIndex(row => row.sessionId === sessionId)
    if (at < 0) return
    this.summaries.splice(at, 1)
    this.failures.delete(sessionId)
    this.notify({ type: 'sessions' })
  }

  setRunning(sessionId, running, errored) {
    const row = this.summaries.find(candidate => candidate.sessionId === sessionId)
    if (row === undefined) return
    const nextErrored = errored ?? row.errored
    if (row.running === running && row.errored === nextErrored) return
    row.running = running
    if (nextErrored !== undefined) row.errored = nextErrored
    this.notify({ type: 'sessions' })
  }

  setActivity(sessionId, time) {
    const at = this.summaries.findIndex(row => row.sessionId === sessionId)
    if (at < 0) return
    const [row] = this.summaries.splice(at, 1)
    this.summaries.unshift({ ...row, updatedAt: time })
    this.notify({ type: 'sessions' })
  }

  setError(sessionId, message) {
    this.failures.set(sessionId, message)
    this.notify({ type: 'error', sessionId, message })
  }

  replace(items) {
    this.summaries = [...items]
    this.failures.clear()
    this.notify({ type: 'sessions' })
  }

  async refresh(signal) {
    const answered = await this.call('list', signal === undefined ? [] : [signal])
    if (!answered.ok) {
      this.notify({ type: 'failure', error: answered.error })
      return answered
    }
    this.replace(answered.value.items)
    return answered
  }

  search(query, signal) {
    return this.call('search', signal === undefined ? [{ query }] : [{ query }, signal])
  }

  modelCatalog() {
    return this.call('modelCatalog', [])
  }

  page(request, signal) {
    return this.call('page', signal === undefined ? [request] : [request, signal])
  }

  projections(sessionId, signal) {
    return this.call('projections', signal === undefined ? [{ sessionId }] : [{ sessionId }, signal])
  }

  follow(request, signal) {
    return this.stream('follow', [request], signal)
  }

  control(signal) {
    return this.stream('control', [], signal)
  }

  create(request) {
    return this.call('create', [request])
  }

  rename(request) {
    return this.call('rename', [request])
  }

  fork(request) {
    return this.call('fork', [request])
  }

  prompt(request) {
    return this.call('prompt', [request])
  }

  attachment(request) {
    return this.call('attachment', [request])
  }

  updateQueue(request) {
    return this.call('updateQueue', [request])
  }

  cancel(request) {
    return this.call('cancel', [request])
  }

  selectModel(request) {
    return this.call('selectModel', [request])
  }

  async call(method, args, signal) {
    const face = this.remote.session
    if (typeof face?.[method] !== 'function') {
      return {
        ok: false,
        error: {
          code: 'unavailable',
          message: `session/${method} is not mounted in this Client`,
          details: { method },
        },
      }
    }
    try {
      return await face[method](...args, ...(signal === undefined ? [] : [signal]))
    } catch (error) {
      return carrierFailure(error)
    }
  }

  stream(method, args, signal) {
    const { $stream, session } = this.remote
    if (typeof $stream !== 'function' || typeof session?.[method] !== 'function') {
      return unsupported(method)
    }
    const name = `session ${method}`
    return {
      ok: true,
      value: $stream({
        name,
        open: (openSignal) => session[method](
          ...args,
          signal === undefined ? openSignal : AbortSignal.any([openSignal, signal]),
        ),
        ended: () => new Error(`${name} ended before release`),
      }),
    }
  }
}

export default ClientSessionModel
