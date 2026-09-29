import { Service } from '@freddie/cordis'

function rosterStreamable(remote) {
  return typeof remote.$stream === 'function' && typeof remote.job.list === 'function'
}

export class ClientJobs extends Service {
  state

  remote
  model
  rowsEntries = new Map()

  constructor(ctx, remote, model) {
    super(ctx, 'jobs')
    this.remote = remote
    this.model = model
    this.state = model
    ctx.effect(() => async () => {
      const open = [...this.rowsEntries.values()]
      this.rowsEntries.clear()
      for (const entry of open) entry.stopped = true
      await Promise.allSettled(open.map(entry => entry.dispose()))
    }, 'job-controller.client.streams')
  }

  kill(sessionId, id) {
    return this.remote.job.kill(sessionId, { jobId: id })
  }

  watchRows(sessionId) {
    if (!rosterStreamable(this.remote)) {
      this.model.rowsDropped(sessionId)
      return () => {}
    }
    return this.acquire(this.rowsEntries, String(sessionId), () => this.startRows(sessionId))
  }

  acquire(entries, key, start) {
    const existing = entries.get(key)
    if (existing !== undefined && !existing.stopped) {
      existing.refs += 1
      return this.releaser(entries, key, existing)
    }
    const entry = start()
    entries.set(key, entry)
    return this.releaser(entries, key, entry)
  }

  releaser(entries, key, entry) {
    let released = false
    return () => {
      if (released) return
      released = true
      entry.refs -= 1
      if (entry.refs > 0) return
      if (entries.get(key) === entry) entries.delete(key)
      entry.stopped = true
      void entry.dispose().then(() => {
        if (entries.has(key)) return
        this.model.rowsDropped(key)
      })
    }
  }

  startRows(sessionId) {
    const name = `job rows ${String(sessionId)}`
    const stream = this.remote.$stream({
      name,
      open: signal => this.remote.job.list(sessionId, signal),
      ended: accepted => new Error(accepted
        ? `${name} ended before release`
        : `${name} ended before its first frame`),
    })
    const entry = {
      refs: 1,
      stopped: false,
      dispose: () => stream.dispose(),
    }
    void (async () => {
      try {
        for await (const item of stream) {
          this.model.rowsReplaced(sessionId, item.value.jobs)
          item.accept()
        }
      } catch {
        if (!entry.stopped) this.model.rowsDropped(sessionId)
      } finally {
        entry.stopped = true
        void entry.dispose()
      }
    })()
    return entry
  }
}

export default ClientJobs
