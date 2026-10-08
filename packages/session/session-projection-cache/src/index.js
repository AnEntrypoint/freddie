import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { snapshotJsonValue } from '@freddie/freddie-session'
import { projectionCacheDomainSpec } from './spec.js'

export { projectionCacheDomainSpec } from './spec.js'

export const Config = z.object({
  writeEveryEvents: z.natural().min(1).required(),
  writeIntervalMs: z.natural().min(1).required(),
})

export class SessionProjectionCache extends Service {
  static inject = ['storageDomain', 'sessionProjections', 'sessionPersistence', 'sessions']

  static Config = Config

  table
  dirty = new Map()

  constructor(ctx, config) {
    super(ctx, 'sessionProjectionCache')
    this.config = config
  }

  async [Service.init]() {
    const domain = await this.ctx.storageDomain.open(projectionCacheDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'sessionProjectionCache.domainClose')
    this.table = domain.table('sessions')
    this.installWritePath()
  }

  recordFor(id, expected) {
    const record = this.requireTable().get(id)
    if (record === undefined) return undefined
    return identityMatches(record.identity, expected) ? record : undefined
  }

  cachedSnapshot(meta) {
    const record = this.recordFor(meta.id, identityOf(meta))
    if (record === undefined) return undefined
    const values = this.ctx.sessionProjections.viewCheckpoint(record.rows)
    const keys = Object.keys(values)
    if (keys.length === 0) return undefined
    const asOfSeq = Math.min(...keys.map(key => record.rows[key].seq))
    return { asOfSeq, values }
  }

  async write(session) {
    const rows = this.ctx.sessionProjections.checkpoint(session)
    this.markClean(session)
    if (this.ctx.sessions.get(session.id) === session) await this.ctx.sessions.flush(session)
    await this.put(session.id, identityOf(session.header), rows)
  }

  async coldSnapshot(id, signal) {
    const record = this.requireTable().get(id)
    const cached = record?.rows ?? {}
    const floor = this.ctx.sessionProjections.restoreFloor(cached)
    const persistence = this.ctx.sessionPersistence
    if (floor === undefined) {
      const probe = await persistence.readFrom(id, 0, signal)
      return { asOfSeq: probe.events.at(-1)?.seq ?? -1, values: {} }
    }
    let restored
    const tail = await persistence.readFrom(id, floor, signal)
    const related = record === undefined || identityMatches(record.identity, identityOf(tail.meta))
    try {
      if (!related) throw new Error('unrelated log identity')
      restored = this.ctx.sessionProjections.restore(cached, tail.events, floor)
    } catch {
      const whole = await persistence.readFrom(id, 0, signal)
      restored = this.ctx.sessionProjections.restore({}, whole.events, 0)
    }
    await this.putSoft(id, identityOf(tail.meta), restored.checkpoint, 'cold-read write-back')
    return restored.snapshot
  }

  installWritePath() {
    this.ctx.on('session/event', (session, event) => {
      if (event.type === 'turn/end') {
        void this.flushSoft(session, 'turn/end')
        return
      }
      const state = this.dirty.get(session) ?? { pending: 0, timer: undefined }
      this.dirty.set(session, state)
      state.pending += 1
      if (state.pending >= this.config.writeEveryEvents) {
        void this.flushSoft(session, 'count threshold')
        return
      }
      state.timer ??= setTimeout(() => {
        void this.flushSoft(session, 'interval')
      }, this.config.writeIntervalMs)
    })

    this.ctx.on('session/disposed', (session) => {
      void this.flushSoft(session, 'detach')
      this.markClean(session)
      this.dirty.delete(session)
    })

    this.ctx.effect(() => () => {
      for (const state of this.dirty.values()) {
        if (state.timer !== undefined) clearTimeout(state.timer)
      }
      this.dirty.clear()
    }, 'sessionProjectionCache.timers')
  }

  async flushSoft(session, trigger) {
    try {
      await this.write(session)
    } catch (error) {
      this.ctx.logger.warn(`session projection cache: ${trigger} write for "${session.id}" failed (cache stays stale): ${String(error)}`)
    }
  }

  markClean(session) {
    const state = this.dirty.get(session)
    if (state === undefined) return
    state.pending = 0
    if (state.timer !== undefined) {
      clearTimeout(state.timer)
      state.timer = undefined
    }
  }

  async put(id, identity, rows) {
    const detached = snapshotJsonValue(rows)
    if (detached === undefined) {
      throw new TypeError('projection checkpoint is not losslessly JSON-serializable (a unit state violates the plain-JSON contract)')
    }
    await this.requireTable().put(id, { identity, rows: detached })
  }

  async putSoft(id, identity, rows, what) {
    try {
      await this.put(id, identity, rows)
    } catch (error) {
      this.ctx.logger.warn(`session projection cache: ${what} for "${id}" failed (cache stays stale): ${String(error)}`)
    }
  }

  requireTable() {
    if (this.table === undefined) throw new Error('session projection cache is not initialized')
    return this.table
  }
}

function identityOf(header) {
  return { createdAt: header.createdAt, ...header.cwd === undefined ? {} : { cwd: header.cwd } }
}

function identityMatches(stored, expected) {
  return stored.createdAt === expected.createdAt && stored.cwd === expected.cwd
}

export default SessionProjectionCache
