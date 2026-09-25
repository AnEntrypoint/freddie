import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { Remote, TypertRemoteService } from '@freddie/freddie-typert-protocol'
import { sessionArtifactsProjection } from './projection.js'
import { sessionArtifactsDomainSpec } from './spec.js'

const EMPTY_ITEMS = Object.freeze([])

function identityOf(header) {
  return Object.freeze({ createdAt: header.createdAt, ...header.cwd === undefined ? {} : { cwd: header.cwd } })
}

function sameIdentity(row, header) {
  return row.session.createdAt === header.createdAt && row.session.cwd === header.cwd
}

function success(value) {
  return Object.freeze({ ok: true, value: Object.freeze(value) })
}

function rejected(code, details = {}) {
  return Object.freeze({ ok: false, error: Object.freeze({ code, ...details }) })
}

function copyItem(item, includeContent = true, sharedFrom = undefined) {
  return Object.freeze({
    id: sharedFrom === undefined ? item.id : `${sharedFrom.sessionId}:${item.id}`,
    name: item.name,
    kind: item.kind,
    bytes: item.bytes,
    revision: item.revision,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    status: item.status,
    sharedWith: Object.freeze([...item.sharedWith]),
    provenance: Object.freeze({ ...item.provenance }),
    ...sharedFrom === undefined ? {} : { sharedFrom },
    ...includeContent ? { content: item.content } : {},
  })
}

function snapshotItems(items, includeContent = true) {
  return Object.freeze(items.map(item => copyItem(item, includeContent)))
}

function validName(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 120
    && !value.includes('/')
    && !value.includes('\\')
    && value !== '.'
    && value !== '..'
    && /^[\w .:@-]+$/u.test(value)
}

function validContent(value, maxBytes) {
  return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= maxBytes
}

/** Host-owned durable conversation artifact and explicit memory record service. */
export class SessionArtifactsService extends TypertRemoteService {
  static inject = ['storageDomain', 'sessionPersistence', 'sessions']

  static Config = z.object({
    maxArtifactBytes: z.number().step(1).min(1).default(65_536),
    maxArtifactsPerSession: z.number().step(1).min(1).default(256),
  })

  table
  tails = new Map()
  accepting = true

  constructor(ctx, config = {}) {
    super(ctx, 'sessionArtifacts')
    this.config = config
    ctx.inject(['sessionProjections'], projectionCtx => {
      projectionCtx.sessionProjections.register(sessionArtifactsProjection)
    })
  }

  async [Service.init]() {
    const domain = await this.ctx.storageDomain.open(sessionArtifactsDomainSpec)
    this.table = domain.table('sessions')
    this.ctx.effect(() => async () => {
      this.accepting = false
      await Promise.all(this.tails.values())
      await domain.close()
    }, 'sessionArtifacts.domainClose')
  }

  async list(request) {
    const known = await this.inspectSession(request.sessionId)
    if (!known.ok) return known
    return success(await this.viewFor(request.sessionId, known.value.meta))
  }

  put(request) {
    if (!validName(request.name)) return Promise.resolve(rejected('artifact-name-invalid'))
    if (!['artifact', 'memory', 'decision', 'evidence', 'plan'].includes(request.kind)) {
      return Promise.resolve(rejected('artifact-kind-invalid'))
    }
    if (!validContent(request.content, this.config.maxArtifactBytes)) {
      return Promise.resolve(rejected('artifact-content-too-large', { maxBytes: this.config.maxArtifactBytes }))
    }
    return this.enqueue(request.sessionId, async () => {
      const known = await this.inspectSession(request.sessionId)
      if (!known.ok) return known
      const row = this.currentRow(request.sessionId, known.value.meta)
      if (request.ifRevision !== row.revision) return rejected('version-conflict', { current: this.view(row) })
      const existing = request.id === undefined ? undefined : row.items.find(item => item.id === request.id)
      if (request.id !== undefined && existing === undefined) return rejected('artifact-not-found', { id: request.id })
      if (existing === undefined && row.items.length >= this.config.maxArtifactsPerSession) {
        return rejected('artifact-limit-reached', { maxItems: this.config.maxArtifactsPerSession })
      }
      const now = Date.now()
      const item = Object.freeze({
        id: existing?.id ?? `artifact-${randomUUID()}`,
        name: request.name,
        kind: request.kind,
        content: request.content,
        bytes: Buffer.byteLength(request.content, 'utf8'),
        revision: (existing?.revision ?? 0) + 1,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        status: existing?.status ?? 'active',
        sharedWith: existing?.sharedWith ?? Object.freeze([]),
        provenance: Object.freeze({
          sessionId: request.sessionId,
          sourceSeq: Number.isSafeInteger(request.sourceSeq) ? request.sourceSeq : null,
          actor: request.actor ?? 'user',
        }),
      })
      const items = existing === undefined ? [...row.items, item] : row.items.map(candidate => candidate.id === item.id ? item : candidate)
      return await this.commit(known.value, row, items)
    })
  }

  deleteArtifact(request) {
    return this.enqueue(request.sessionId, async () => {
      const known = await this.inspectSession(request.sessionId)
      if (!known.ok) return known
      const row = this.currentRow(request.sessionId, known.value.meta)
      if (request.ifRevision !== row.revision) return rejected('version-conflict', { current: this.view(row) })
      const item = row.items.find(candidate => candidate.id === request.id)
      if (item === undefined) return rejected('artifact-not-found', { id: request.id })
      return await this.commit(known.value, row, row.items.filter(candidate => candidate !== item))
    })
  }

  share(request) {
    return this.enqueue(request.sessionId, async () => {
      const known = await this.inspectSession(request.sessionId)
      if (!known.ok) return known
      const row = this.currentRow(request.sessionId, known.value.meta)
      if (request.ifRevision !== row.revision) return rejected('version-conflict', { current: this.view(row) })
      if (typeof request.targetSessionId !== 'string' || request.targetSessionId.length === 0 || request.targetSessionId === request.sessionId) {
        return rejected('share-target-invalid')
      }
      const item = row.items.find(candidate => candidate.id === request.id)
      if (item === undefined) return rejected('artifact-not-found', { id: request.id })
      const sharedWith = request.grant === true
        ? [...new Set([...item.sharedWith, request.targetSessionId])]
        : item.sharedWith.filter(id => id !== request.targetSessionId)
      const replacement = Object.freeze({ ...item, sharedWith: Object.freeze(sharedWith), revision: item.revision + 1, updatedAt: Date.now() })
      return await this.commit(known.value, row, row.items.map(candidate => candidate === item ? replacement : candidate))
    })
  }

  async inspectSession(sessionId) {
    if (this.ctx.sessions.get(sessionId) === undefined) {
      const snapshots = await this.ctx.sessionPersistence.listSnapshots()
      if (!snapshots.some(snapshot => snapshot.header.id === sessionId) && this.ctx.sessions.get(sessionId) === undefined) {
        return rejected('session-not-found', { sessionId })
      }
    }
    return success(await this.ctx.sessionPersistence.inspect(sessionId))
  }

  currentRow(sessionId, header) {
    const stored = this.requireTable().get(sessionId)
    if (stored !== undefined && sameIdentity(stored, header)) return stored
    return Object.freeze({ session: identityOf(header), revision: 0, items: EMPTY_ITEMS })
  }

  async viewFor(sessionId, header) {
    const owned = this.currentRow(sessionId, header)
    const shared = []
    for (const [sourceSessionId, row] of this.requireTable().entries()) {
      if (sourceSessionId === sessionId || !row.items.some(item => item.sharedWith.includes(sessionId))) continue
      const source = await this.inspectSession(sourceSessionId)
      if (!source.ok || !sameIdentity(row, source.value.meta)) continue
      for (const item of row.items) {
        if (!item.sharedWith.includes(sessionId)) continue
        shared.push(copyItem(item, true, Object.freeze({
          sessionId: sourceSessionId,
          itemId: item.id,
          sourceRevision: item.revision,
          sourceProvenance: Object.freeze({ ...item.provenance }),
        })))
      }
    }
    return Object.freeze({
      revision: owned.revision,
      items: Object.freeze([...snapshotItems(owned.items), ...shared]),
    })
  }

  async commit(inspection, row, items) {
    const next = Object.freeze({
      session: identityOf(inspection.meta),
      revision: row.revision + 1,
      items: Object.freeze(items.map(item => copyItem(item))),
    })
    await this.requireTable().put(inspection.meta.id, next)
    const live = this.ctx.sessions.get(inspection.meta.id)
    if (live !== undefined && live.header.createdAt === inspection.meta.createdAt) {
      live.append('session-artifacts/changed', this.view(next), { ignorable: true })
    }
    return success({ revision: next.revision, items: snapshotItems(next.items) })
  }

  view(row) {
    return Object.freeze({ revision: row.revision, items: snapshotItems(row.items, false) })
  }

  enqueue(sessionId, operation) {
    if (!this.accepting) return Promise.reject(new Error('session-artifacts: service is disposing'))
    const prior = this.tails.get(sessionId) ?? Promise.resolve()
    const result = prior.then(operation)
    const tail = result.then(() => undefined, () => undefined)
    this.tails.set(sessionId, tail)
    return result.finally(() => { if (this.tails.get(sessionId) === tail) this.tails.delete(sessionId) })
  }

  requireTable() {
    if (this.table === undefined) throw new Error('session-artifacts: durable domain is not initialized')
    return this.table
  }
}

Remote('list')(SessionArtifactsService.prototype.list, { name: 'list', private: false, static: false, addInitializer: fn => { fn.call(Object.create(SessionArtifactsService.prototype)) } })
Remote('put')(SessionArtifactsService.prototype.put, { name: 'put', private: false, static: false, addInitializer: fn => { fn.call(Object.create(SessionArtifactsService.prototype)) } })
Remote('deleteArtifact')(SessionArtifactsService.prototype.deleteArtifact, { name: 'deleteArtifact', private: false, static: false, addInitializer: fn => { fn.call(Object.create(SessionArtifactsService.prototype)) } })
Remote('share')(SessionArtifactsService.prototype.share, { name: 'share', private: false, static: false, addInitializer: fn => { fn.call(Object.create(SessionArtifactsService.prototype)) } })

export default SessionArtifactsService
