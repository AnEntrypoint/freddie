import { Service } from '@freddie/cordis'

export class SessionProjectionRegistry extends Service {
  registrations = new Map()
  listeners = new Set()

  constructor(ctx) {
    super(ctx, 'sessionProjections')
    ctx.on('session/event', (session, event) => {
      this.drive(session, event)
    })
  }

  register(definition) {
    const wire = definition.wire
    const erased = {
      key: definition.key,
      init: () => definition.init(),
      apply: (state, event) => definition.apply(state, event),
      wire: wire === undefined
        ? undefined
        : { view: state => wire.view(state) },
      stateVersion: definition.stateVersion,
    }
    if (!Number.isSafeInteger(definition.stateVersion) || definition.stateVersion < 0) {
      throw new Error(`session projection ${JSON.stringify(definition.key)} stateVersion must be a non-negative integer, got ${String(definition.stateVersion)}`)
    }
    const dispose = this.ctx.effect(function* () {
      const key = erased.key
      const existing = this.registrations.get(key)
      if (existing === undefined) {
        this.registrations.set(key, { def: erased, cells: new WeakMap(), refs: 1 })
      } else {
        if (existing.def.stateVersion !== erased.stateVersion) {
          throw new Error(`session projection key ${JSON.stringify(key)} is already registered at stateVersion ${String(existing.def.stateVersion)}; refusing to share it with stateVersion ${String(erased.stateVersion)}`)
        }
        existing.refs += 1
      }
      yield () => {
        const live = this.registrations.get(key)
        if (live === undefined) return
        live.refs -= 1
        if (live.refs === 0) this.registrations.delete(key)
      }
    }.bind(this), 'sessionProjections.register()')
    return () => void dispose()
  }

  onChanged(listener) {
    const dispose = this.ctx.effect(() => {
      this.listeners.add(listener)
      return () => {
        this.listeners.delete(listener)
      }
    }, 'sessionProjections.onChanged()')
    return () => void dispose()
  }

  stateOf(session, key) {
    const registration = this.registrations.get(key)
    if (registration === undefined) return undefined
    return this.cellFor(registration, session).state
  }

  snapshot(session) {
    const values = {}
    for (const registration of this.registrations.values()) {
      if (registration.def.wire === undefined) continue
      const cell = this.cellFor(registration, session)
      values[registration.def.key] = registration.def.wire.view(cell.state)
    }
    return { asOfSeq: session.seq - 1, values }
  }

  checkpoint(session) {
    const rows = {}
    for (const registration of this.registrations.values()) {
      const cell = this.cellFor(registration, session)
      rows[registration.def.key] = {
        ver: registration.def.stateVersion,
        seq: cell.observedSeq,
        val: structuredClone(cell.state),
      }
    }
    return rows
  }

  restoreFloor(checkpoint) {
    let floor
    for (const registration of this.registrations.values()) {
      const row = checkpoint[registration.def.key]
      const need = row !== undefined && row.ver === registration.def.stateVersion
        ? Math.max(row.seq + 1, 0)
        : 0
      floor = floor === undefined ? need : Math.min(floor, need)
    }
    return floor === undefined ? undefined : Math.max(floor - 1, 0)
  }

  viewCheckpoint(checkpoint) {
    const values = {}
    for (const registration of this.registrations.values()) {
      const def = registration.def
      if (def.wire === undefined) continue
      const row = checkpoint[def.key]
      if (row === undefined || row.ver !== def.stateVersion) continue
      values[def.key] = def.wire.view(row.val)
    }
    return values
  }

  restore(checkpoint, events, baseSeq) {
    const endSeq = events.at(-1)?.seq ?? baseSeq - 1
    const values = {}
    const refreshed = {}
    for (const registration of this.registrations.values()) {
      const def = registration.def
      const row = checkpoint[def.key]
      const usable = row !== undefined
        && row.ver === def.stateVersion
        && row.seq >= baseSeq - 1
        && row.seq <= endSeq
      if (!usable && baseSeq > 0) {
        throw new Error(
          `session projection ${JSON.stringify(def.key)} cannot restore from seq ${baseSeq}: `
          + 'its checkpoint row is missing, version-mismatched, or beyond the supplied log end; re-read from seq 0',
        )
      }
      let state = usable ? row.val : def.init()
      const from = usable ? row.seq : baseSeq - 1
      for (const event of events) {
        if (event.seq > from) state = def.apply(state, event)
      }
      if (def.wire !== undefined) values[def.key] = def.wire.view(state)
      refreshed[def.key] = { ver: def.stateVersion, seq: endSeq, val: state }
    }
    return {
      snapshot: { asOfSeq: endSeq, values: values },
      checkpoint: refreshed,
    }
  }

  buildCell(def, events) {
    let state = def.init()
    for (const event of events) state = def.apply(state, event)
    return { state, observedSeq: (events.at(-1)?.seq ?? -1) }
  }

  cellFor(registration, session) {
    let cell = registration.cells.get(session)
    if (cell === undefined) {
      cell = this.buildCell(registration.def, session.events)
      registration.cells.set(session, cell)
    }
    return cell
  }

  drive(session, event) {
    for (const registration of this.registrations.values()) {
      let cell = registration.cells.get(session)
      if (cell === undefined) {
        cell = this.buildCell(registration.def, session.events.slice(0, event.seq))
        registration.cells.set(session, cell)
      }
      const next = registration.def.apply(cell.state, event)
      const changed = !Object.is(next, cell.state)
      cell.state = next
      cell.observedSeq = event.seq
      if (changed && registration.def.wire !== undefined && this.listeners.size > 0) {
        const value = registration.def.wire.view(next)
        for (const listener of this.listeners) {
          listener(session, registration.def.key, value, event.seq)
        }
      }
    }
  }
}

export default SessionProjectionRegistry
