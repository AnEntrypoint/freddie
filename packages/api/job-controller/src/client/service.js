/**
 * The `ctx.jobs` client service: reference-counted roster streams over the
 * `job` namespace — one roster stream per watched session, so overlapping
 * viewers share a stream and rosters resume whole after a reconnect — plus the
 * human kill passthrough over `job.kill`.
 * @module @freddie/freddie-job-controller/client/service
 */

import { Service } from '@freddie/cordis'

/**
 * Roster streams need both halves of a streaming Remote: a carrier factory and
 * the roster endpoint. freddie's Client Remote carries unary calls over `/api`
 * and two fixed event downlinks, so either half can be absent and the roster
 * then stays absent rather than showing a stale set.
 * @param remote - the Client Remote faces this service drives.
 * @returns whether a roster stream can be opened.
 */
function rosterStreamable(remote) {
  return typeof remote.$stream === 'function' && typeof remote.job.list === 'function'
}

/** The client jobs service face. */
export class ClientJobs extends Service {
  /** Rosters keyed by watched session. */
  state

  remote
  model
  rowsEntries = new Map()

  /**
   * @param ctx - client root Context.
   * @param remote - the Gateway stream factory plus the `job` namespace.
   * @param model - shared client jobs model.
   */
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

  /**
   * Kill one background job from a session's job list. Pure RPC passthrough:
   * row state converges through the roster stream, and the caller (the job-list
   * control) owns error presentation.
   * @param sessionId - session whose job list carries the job.
   * @param id - the job row's registry id.
   * @returns the registry's admission, or the business/transport failure.
   */
  kill(sessionId, id) {
    return this.remote.job.kill(sessionId, { jobId: id })
  }

  /**
   * Keep one session's roster current; reference-counted, so two watchers of
   * the same session share one stream and the rows leave with the last.
   * @param sessionId - the session whose visible jobs to mirror.
   * @returns stop function releasing this watcher's reference.
   */
  watchRows(sessionId) {
    if (!rosterStreamable(this.remote)) {
      this.model.rowsDropped(sessionId)
      return () => {}
    }
    return this.acquire(this.rowsEntries, String(sessionId), () => this.startRows(sessionId))
  }

  /** Share the live entry under `key` or start one, and hand back its release. */
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

  /**
   * Release closures bind the exact entry they were minted for, never the
   * map's current occupant: a later acquire on the same key may have replaced
   * a stopped entry, and decrementing or disposing through the key alone
   * would tear down that newer stream's references.
   */
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
