/**
 * Durable, lifecycle-bound feedback for finalized assistant messages.
 * @module @freddie/freddie-message-feedback
 */

import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { Service } from '@freddie/cordis'
import s from '@freddie/schemastery'
import { deriveEventMessage, isAppendSurfaceEvent } from '@freddie/freddie-session/surface'
import { TypertRemoteService, Remote } from '@freddie/freddie-typert-protocol'
import { messageFeedbackDomainSpec } from './spec.js'

export { messageFeedbackDomainSpec } from './spec.js'

/** Immutable empty list reused only as an input to caller-owned copying. */
const EMPTY_ITEMS = Object.freeze([])

/** Validate the one deployment-varying limit at the configuration boundary. */
function resolveMaxNoteBytes(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(
      `message-feedback: maxNoteBytes must be a positive safe integer, got ${String(value)}`,
    )
  }
  return value
}

/** Copy and freeze one item before it crosses the service boundary. */
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

/** Copy and freeze a list response. */
function snapshotList(items) {
  return Object.freeze({ items: Object.freeze(items.map(snapshotItem)) })
}

/** Build a frozen success branch. */
function success(value) {
  return Object.freeze({ ok: true, value })
}

/** Build a frozen business-failure branch. */
function rejected(error) {
  return Object.freeze({ ok: false, error: Object.freeze(error) })
}

/** Project the Session fields that distinguish one persisted log lifecycle. */
function identityOf(header) {
  return Object.freeze({
    createdAt: header.createdAt,
    ...(header.cwd === undefined ? {} : { cwd: header.cwd }),
  })
}

/** Whether a stored row belongs to the inspected Session lifecycle. */
function sameIdentity(row, header) {
  return row.session.createdAt === header.createdAt && row.session.cwd === header.cwd
}

/** Whether two observations name the same persisted Session lifecycle. */
function sameHeaderIdentity(left, right) {
  return left.id === right.id && left.createdAt === right.createdAt && left.cwd === right.cwd
}

/** Freeze the replacement row so storage-domain never exposes mutable aliases. */
function rowSnapshot(session, items) {
  const copiedItems = items.map(snapshotItem)
  Object.freeze(copiedItems)
  return Object.freeze({
    session,
    items: copiedItems,
  })
}

/** Generate an opaque equality token for one material mutation. */
function nextVersion() {
  return randomUUID()
}

/**
 * Storage-domain sidecar service. It inspects persisted Session history and
 * never creates or resumes an Agent or Session.
 */
export class MessageFeedbackService extends TypertRemoteService {
  static inject = ['storageDomain', 'sessionPersistence', 'sessions']

  /** Loader validation for the required note-size policy. */
  static Config = s.object({
    maxNoteBytes: s.number().step(1).min(1).required(),
  })

  maxNoteBytes
  table
  operationTails = new Map()
  mutationAdmissionOpen = true

  /**
   * @param ctx - Host context carrying persistence and the storage-domain form.
   * @param config - Required note-size policy.
   */
  constructor(ctx, config) {
    super(ctx, 'messageFeedback')
    this.maxNoteBytes = resolveMaxNoteBytes(config.maxNoteBytes)
  }

  /** Open and own the one message-feedback sidecar domain. */
  async [Service.init]() {
    const domain = await this.ctx.storageDomain.open(messageFeedbackDomainSpec)
    this.ctx.effect(() => async () => {
      this.mutationAdmissionOpen = false
      await Promise.all(this.operationTails.values())
      await domain.close()
    }, 'message-feedback.domainClose')
    this.table = domain.table('sessions')
  }

  /**
   * Read feedback belonging to the current persisted Session lifecycle.
   * A stale row from a reused Session id is invisible.
   * @param request - Session identity to inspect and list.
   * @returns current immutable items or `session-not-found`.
   */
  async list(request) {
    const known = await this.inspectSession(request.sessionId)
    if (!known.ok) return known
    const row = this.requireTable().get(request.sessionId)
    const items = row !== undefined && sameIdentity(row, known.value.meta) ? row.items : EMPTY_ITEMS
    return success(snapshotList(items))
  }

  /**
   * Create or replace feedback for one derived append-origin assistant
   * message. Every request must match the addressed item's current version;
   * a matching no-op returns the stored item without changing its revision.
   * @param request - target, desired value, and observed item version.
   * @returns the committed item or an explicit business failure.
   */
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

  /**
   * Delete one feedback item. Absence is successful regardless of the
   * supplied version; an existing item requires an exact version match.
   * @param request - Session, message, and observed item version.
   * @returns the stable absent postcondition, or an explicit failure.
   */
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

  /**
   * Resolve a live owner directly; otherwise use the storage catalog as the
   * existence authority before inspecting the log. Inspection failures for a
   * catalogued Session remain infrastructure failures rather than being
   * guessed into the business `session-not-found` branch.
   */
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

  /** Require the exact finalized append-origin assistant message projection. */
  hasFeedbackTarget(inspection, messageId) {
    return inspection.events.some((event) => {
      if (event.type !== 'assistant/message' || !isAppendSurfaceEvent(event)) return false
      const message = deriveEventMessage(event)
      return message?.role === 'assistant' && message.id === messageId
    })
  }

  /**
   * Put the target log prefix behind a durability barrier before its sidecar.
   * A live owner flushes through the SessionStore's canonical checkpoint; a
   * cold owner is re-read from the physical durable prefix.
   */
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

  /** Validate optional-note semantics and the configured complete UTF-8 byte bound. */
  resolveNote(note) {
    if (note === undefined) return success(undefined)
    if (note.trim().length === 0) return rejected({ code: 'note-blank' })
    const actualBytes = Buffer.byteLength(note, 'utf8')
    if (actualBytes > this.maxNoteBytes) {
      return rejected({ code: 'note-too-large', maxBytes: this.maxNoteBytes, actualBytes })
    }
    return success(note)
  }

  /** Return the authoritative item needed to reconcile one failed comparison. */
  versionConflict(current) {
    return {
      code: 'version-conflict',
      current: current === null ? null : snapshotItem(current),
    }
  }

  /** Queue a complete read/compare/write mutation behind this Session's prior mutation. */
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

  /** Resolve the initialized durable table or fail a broken service lifecycle. */
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
