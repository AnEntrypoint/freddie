import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { Service } from '@freddie/cordis'
import s from '@freddie/schemastery'
import { deriveEventMessage, isAppendSurfaceEvent } from '@freddie/freddie-session/surface'
import { TypertRemoteService, Remote } from '@freddie/freddie-typert-protocol'
import { messageFeedbackDomainSpec } from './spec.js'

export { messageFeedbackDomainSpec } from './spec.js'

const EMPTY_ITEMS = Object.freeze([])

function resolveMaxNoteBytes(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(
      `message-feedback: maxNoteBytes must be a positive safe integer, got ${String(value)}`,
    )
  }
  return value
}

function snapshotItem(item) {
  return Object.freeze({
    messageId: item.messageId,
    rating: item.rating,
    ...(item.note === undefined ? {} : { note: item.note }),
    version: item.version,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  })
}

function snapshotList(items) {
  return Object.freeze({ items: Object.freeze(items.map(snapshotItem)) })
}

function success(value) {
  return Object.freeze({ ok: true, value })
}

function rejected(error) {
  return Object.freeze({ ok: false, error: Object.freeze(error) })
}

function identityOf(header) {
  return Object.freeze({
    createdAt: header.createdAt,
    ...(header.cwd === undefined ? {} : { cwd: header.cwd }),
  })
}

function sameIdentity(row, header) {
  return row.session.createdAt === header.createdAt && row.session.cwd === header.cwd
}

function sameHeaderIdentity(left, right) {
  return left.id === right.id && left.createdAt === right.createdAt && left.cwd === right.cwd
}

function rowSnapshot(session, items) {
  const copiedItems = items.map(snapshotItem)
  Object.freeze(copiedItems)
  return Object.freeze({
    session,
    items: copiedItems,
  })
}

function nextVersion() {
  return randomUUID()
}

export class MessageFeedbackService extends TypertRemoteService {
  static inject = ['storageDomain', 'sessionPersistence', 'sessions']

  static Config = s.object({
    maxNoteBytes: s.number().step(1).min(1).required(),
  })

  maxNoteBytes
  table
  operationTails = new Map()
  mutationAdmissionOpen = true

  constructor(ctx, config) {
    super(ctx, 'messageFeedback')
    this.maxNoteBytes = resolveMaxNoteBytes(config.maxNoteBytes)
  }

  async [Service.init]() {
    const domain = await this.ctx.storageDomain.open(messageFeedbackDomainSpec)
    this.ctx.effect(() => async () => {
      this.mutationAdmissionOpen = false
      await Promise.all(this.operationTails.values())
      await domain.close()
    }, 'message-feedback.domainClose')
    this.table = domain.table('sessions')
  }

  async list(request) {
    const known = await this.inspectSession(request.sessionId)
    if (!known.ok) return known
    const row = this.requireTable().get(request.sessionId)
    const items = row !== undefined && sameIdentity(row, known.value.meta) ? row.items : EMPTY_ITEMS
    return success(snapshotList(items))
  }

  put(request) {
    const note = this.resolveNote(request.note)
    if (!note.ok) return Promise.resolve(note)
    return this.enqueue(request.sessionId, async () => {
      const known = await this.inspectSession(request.sessionId)
      if (!known.ok) return known
      if (!this.hasFeedbackTarget(known.value, request.messageId)) {
        return rejected({
          code: 'target-not-found',
          sessionId: request.sessionId,
          messageId: request.messageId,
        })
      }

      const durable = await this.ensureTargetDurable(known.value)
      if (!sameHeaderIdentity(durable.meta, known.value.meta)
        || !this.hasFeedbackTarget(durable, request.messageId)) {
        return rejected({
          code: 'target-not-found',
          sessionId: request.sessionId,
          messageId: request.messageId,
        })
      }

      const table = this.requireTable()
      const stored = table.get(request.sessionId)
      const current = stored !== undefined && sameIdentity(stored, durable.meta) ? stored : undefined
      const items = current?.items ?? EMPTY_ITEMS
      const index = items.findIndex(item => item.messageId === request.messageId)
      const existing = items[index]
      if (request.ifVersion !== (existing?.version ?? null)) {
        return rejected(this.versionConflict(existing ?? null))
      }
      if (existing !== undefined
        && existing.rating === request.rating
        && existing.note === note.value) {
        return success(snapshotItem(existing))
      }

      const now = Date.now()
      const item = snapshotItem({
        messageId: request.messageId,
        rating: request.rating,
        ...(note.value === undefined ? {} : { note: note.value }),
        version: nextVersion(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: existing === undefined ? now : Math.max(now, existing.updatedAt),
      })
      const nextItems = [...items]
      if (index === -1) nextItems.push(item)
      else nextItems[index] = item
      await table.put(
        request.sessionId,
        rowSnapshot(identityOf(durable.meta), nextItems),
      )
      return success(snapshotItem(item))
    })
  }

  delete(request) {
    return this.enqueue(request.sessionId, async () => {
      const known = await this.inspectSession(request.sessionId)
      if (!known.ok) return known

      const table = this.requireTable()
      const stored = table.get(request.sessionId)
      const current = stored !== undefined && sameIdentity(stored, known.value.meta) ? stored : undefined
      const items = current?.items ?? EMPTY_ITEMS
      const existing = items.find(item => item.messageId === request.messageId)
      if (existing === undefined) {
        return success(Object.freeze({ absent: true }))
      }
      if (request.ifVersion !== existing.version) {
        return rejected(this.versionConflict(existing))
      }

      await table.put(
        request.sessionId,
        rowSnapshot(identityOf(known.value.meta), items.filter(item => item !== existing)),
      )
      return success(Object.freeze({ absent: true }))
    })
  }

  async inspectSession(sessionId) {
    if (this.ctx.sessions.get(sessionId) === undefined) {
      const snapshots = await this.ctx.sessionPersistence.listSnapshots()
      if (!snapshots.some(snapshot => snapshot.header.id === sessionId)
        && this.ctx.sessions.get(sessionId) === undefined) {
        return rejected({ code: 'session-not-found', sessionId })
      }
    }
    return success(await this.ctx.sessionPersistence.inspect(sessionId))
  }

  hasFeedbackTarget(inspection, messageId) {
    return inspection.events.some((event) => {
      if (event.type !== 'assistant/message' || !isAppendSurfaceEvent(event)) return false
      const message = deriveEventMessage(event)
      return message?.role === 'assistant' && message.id === messageId
    })
  }

  async ensureTargetDurable(inspection) {
    const live = this.ctx.sessions.get(inspection.meta.id)
    if (live !== undefined && sameHeaderIdentity(live.header, inspection.meta)) {
      if (!(await this.ctx.sessions.flush(live))) {
        throw new Error(
          `message-feedback: no durability listener participated for live session '${inspection.meta.id}'`,
        )
      }
      return await this.ctx.sessionPersistence.readFrom(inspection.meta.id, 0)
    }
    return await this.ctx.sessionPersistence.readFrom(inspection.meta.id, 0)
  }

  resolveNote(note) {
    if (note === undefined) return success(undefined)
    if (note.trim().length === 0) return rejected({ code: 'note-blank' })
    const actualBytes = Buffer.byteLength(note, 'utf8')
    if (actualBytes > this.maxNoteBytes) {
      return rejected({ code: 'note-too-large', maxBytes: this.maxNoteBytes, actualBytes })
    }
    return success(note)
  }

  versionConflict(current) {
    return {
      code: 'version-conflict',
      current: current === null ? null : snapshotItem(current),
    }
  }

  enqueue(sessionId, operation) {
    if (!this.mutationAdmissionOpen) {
      return Promise.reject(new Error('message-feedback: service is disposing'))
    }
    const previous = this.operationTails.get(sessionId) ?? Promise.resolve()
    const result = previous.then(operation)
    const tail = result.then(() => undefined, () => undefined)
    this.operationTails.set(sessionId, tail)
    return result.finally(() => {
      if (this.operationTails.get(sessionId) === tail) this.operationTails.delete(sessionId)
    })
  }

  requireTable() {
    if (this.table === undefined) {
      throw new Error('message-feedback: durable domain is not initialized')
    }
    return this.table
  }
}
Remote('list')(MessageFeedbackService.prototype.list, {
  name: 'list',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(MessageFeedbackService.prototype)) },
})
Remote('put')(MessageFeedbackService.prototype.put, {
  name: 'put',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(MessageFeedbackService.prototype)) },
})
Remote('delete')(MessageFeedbackService.prototype.delete, {
  name: 'delete',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(MessageFeedbackService.prototype)) },
})

export default MessageFeedbackService
