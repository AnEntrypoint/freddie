
import { transportError } from '@freddie/freddie-host-apiproxy/api'
import { mergeOrderedBaseline } from '../ordered-baseline.js'
import { flattenLineage } from './lineage.js'
import { Notifier } from './notifier.js'
import { ProjectionValueStore } from './projection-store.js'
import { Session } from './session.js'
import { TerminalActivityStore } from './terminal-activity.js'

function bufferedRequestKey(envelope) {
  const frame = envelope.payload
  switch (frame.type) {
    case 'approval/requested': return `a:${frame.approvalId}`
    case 'question/requested': return `q:${envelope.rpcId}`
    case 'session/queue': return 'queue'
    default: return undefined
  }
}

function questionInteractionStatus(
  questions,
) {
  if (questions.length !== 1) return 'question'
  const question = questions[0]
  const intent = question.intent
  if (intent?.kind !== 'plan-review' || question.detail === undefined) return 'question'
  if (question.multiSelect === true) return 'question'
  const options = question.options ?? []
  if (options.length > 2) return 'question'
  return options.some(option => option.label === intent.approve) ? 'plan-review' : 'question'
}

function composerLeadingStatus(statuses) {
  return statuses.find(candidate => candidate !== 'approval') ?? statuses[0]
}

export class SessionManager {
  sessions = new Map()
  pendingBuffers = new Map()
  pendingInteractions = new Map()
  completedNotifications = new Set()
  prevRunning = new Map()
  projectionStores = new Map()
  summaries = []
  listState = 'idle'
  listPhase = 'pending'
  listError = null
  listInflight = null
  listMutations = null
  addresses = new Map()
  catalogs = new Map()
  catalogInflight = new Map()
  catalogStale = new Set()
  openCatalogs = new Set()
  catalogDebounce = new Map()
  jobsBySession = new Map()
  terminalsBySession = new Map()
  activityBySession = new Map()
  treeActivitySnapshot = Object.freeze([])
  treeTerminalSnapshot = Object.freeze([])
  treeActivityNotifier = new Notifier(() => {
    this.treeActivitySnapshot = Object.freeze([...this.activityBySession].flatMap(([sessionId, events]) => events.map(event => Object.freeze({ sessionId, event }))))
    this.treeTerminalSnapshot = Object.freeze([...this.terminalsBySession].flatMap(([sessionId, store]) => store.getSnapshot().map(terminal => Object.freeze({ sessionId, terminal }))))
  })
  treeActivitySourceCache
  treeTerminalSourceCache

  selected

  listSnapshotCache
  entryCache = new Map()
  itemsCache = []
  notifier = new Notifier(() => {
    this.listSnapshotCache = this.buildListSnapshot()
  })

  constructor(
    api,
    remote,
    restoredSelection,
    restoredAddress,
    conversation,
  ) {
    this.api = api
    this.remote = remote
    this.conversation = conversation
    this.selected = restoredSelection
    if (restoredAddress !== undefined) this.addresses.set(restoredAddress.childSessionId, restoredAddress)
    this.listSnapshotCache = this.buildListSnapshot()
  }


  select(sessionId) {
    const address = this.navigationAddress(sessionId)
    if (!this.summaries.some(summary => summary.sessionId === sessionId) && address === undefined) {
      throw new Error(`sessions.select: unknown session ${sessionId}`)
    }
    if (address !== undefined) this.addresses.set(sessionId, address)
    this.sessions.get(sessionId)?.configureSubagent(
      address,
      address === undefined
        ? false
        : this.catalogs.get(address.parentSessionId)?.parentAvailable ?? false,
    )
    this.selected = sessionId
    this.completedNotifications.delete(sessionId)
    void this.refreshSubagents(sessionId)
    this.notifier.notifyNow()
  }

  selectSubagent(address) {
    const catalog = this.catalogs.get(address.parentSessionId)
    const entry = catalog?.entries.find(candidate => candidate.id === address.childSessionId)
    if (entry === undefined || entry.kind !== 'child' || entry.mode !== address.mode) {
      throw new Error(`sessions.selectSubagent: ${address.childSessionId} is not a healthy catalog child`)
    }
    this.addresses.set(address.childSessionId, address)
    this.sessions.get(address.childSessionId)?.configureSubagent(address, catalog?.parentAvailable ?? false)
    this.selected = address.childSessionId
    this.completedNotifications.delete(address.childSessionId)
    void this.refreshSubagents(address.childSessionId)
    this.notifier.notifyNow()
  }

  clearSelection() {
    this.selected = undefined
    this.notifier.notifyNow()
  }

  subagentAddress(sessionId) {
    return this.addresses.get(sessionId)
  }

  navigationAddress(sessionId) {
    const retained = this.addresses.get(sessionId)
    if (retained !== undefined) return retained
    for (const [parentSessionId, catalog] of this.catalogs) {
      const child = catalog.entries.find(entry => entry.kind === 'child' && entry.id === sessionId)
      if (child?.kind === 'child') {
        return { parentSessionId, childSessionId: sessionId, mode: child.mode }
      }
    }
    return undefined
  }


  drop(sessionId) {
    this.sessions.delete(sessionId)
  }

  get(sessionId) {
    let session = this.sessions.get(sessionId)
    if (session === undefined) {
      session = this.createSession(sessionId)
      this.sessions.set(sessionId, session)
      const buffered = this.pendingBuffers.get(sessionId)
      if (buffered !== undefined) {
        this.pendingBuffers.delete(sessionId)
        for (const envelope of buffered) session.handleMuxEnvelope(envelope.rpcId, envelope.payload)
      }
      const summary = this.summaries.find(s => s.sessionId === sessionId)
      if (summary !== undefined) {
        session.handleBlank(summary.blank)
        session.handleRunning(summary.running)
      } else {
        const address = this.addresses.get(sessionId)
        const child = address === undefined ? undefined : this.catalogs.get(address.parentSessionId)?.entries
          .find(entry => entry.kind === 'child' && entry.id === sessionId)
        if (child?.kind === 'child') {
          session.handleBlank(false)
          session.handleRunning(child.activity === 'running')
        }
      }
    }
    return session
  }

  createSession(sessionId) {
    const address = this.addresses.get(sessionId)
    return new Session(sessionId, this.api, this.remote, {
      ...(address === undefined ? {} : {
        address,
        parentAvailable: this.catalogs.get(address.parentSessionId)?.parentAvailable ?? false,
      }),
      onEngaged: (engaged) => {
        this.recordMutation({ kind: 'engaged', sessionId: engaged.sessionId })
      },
      projections: this.projectionStore(sessionId),
      ...this.conversation === undefined ? {} : { conversation: this.conversation },
    })
  }

  rebuildConversationRegistry() {
    for (const session of this.sessions.values()) session.rebuildConversationRegistry()
  }

  projectionStore(sessionId) {
    let store = this.projectionStores.get(sessionId)
    if (store === undefined) {
      store = new ProjectionValueStore()
      store.subscribeAny(() => { this.notifier.markDirty() })
      this.projectionStores.set(sessionId, store)
    }
    return store
  }

  terminalStore(sessionId) {
    let store = this.terminalsBySession.get(sessionId)
    if (store === undefined) {
      store = new TerminalActivityStore()
      this.terminalsBySession.set(sessionId, store)
    }
    return store
  }

  noteActivity(sessionId, event) {
    const prior = this.activityBySession.get(sessionId) ?? []
    const next = [...prior, event]
    this.activityBySession.set(sessionId, next.length <= 80 ? next : next.slice(-80))
    this.treeActivityNotifier.markDirty()
  }

  clearTreeActivity(sessionId) {
    const activity = this.activityBySession.delete(sessionId)
    const terminals = this.terminalsBySession.delete(sessionId)
    if (activity || terminals) this.treeActivityNotifier.markDirty()
  }

  treeTerminalSource() {
    if (this.treeTerminalSourceCache === undefined) {
      this.treeTerminalSourceCache = {
        getSnapshot: () => {
          this.treeActivityNotifier.ensureFresh()
          return this.treeTerminalSnapshot
        },
        subscribe: listener => this.treeActivityNotifier.subscribe(listener),
      }
    }
    return this.treeTerminalSourceCache
  }

  treeActivitySource() {
    if (this.treeActivitySourceCache === undefined) {
      this.treeActivitySourceCache = {
        getSnapshot: () => {
          this.treeActivityNotifier.ensureFresh()
          return this.treeActivitySnapshot
        },
        subscribe: listener => this.treeActivityNotifier.subscribe(listener),
      }
    }
    return this.treeActivitySourceCache
  }

  refreshSubagents(parentSessionId) {
    const existing = this.catalogInflight.get(parentSessionId)
    if (existing !== undefined) return existing.promise
    const previous = this.catalogs.get(parentSessionId)
    const expandableRows = new Set()
    const activityRows = new Map()
    this.catalogs.set(parentSessionId, {
      entries: previous?.entries ?? [],
      parentAvailable: previous?.parentAvailable ?? false,
      state: 'loading',
      error: null,
    })
    this.notifier.markDirty()
    const operation = (async () => {
      try {
        const { result } = await this.api.subagents.list({ parentSessionId })
        if (result.ok) {
          const parentAvailable = this.catalogInflight.get(parentSessionId)?.parentAvailableOverride
            ?? result.value.parentAvailable
          this.catalogs.set(parentSessionId, {
            ...result.value,
            entries: this.withCatalogMutations(result.value.entries, expandableRows, activityRows),
            parentAvailable,
            state: 'ready',
            error: null,
          })
          for (const [childId, address] of this.addresses) {
            if (address.parentSessionId !== parentSessionId) continue
            this.sessions.get(childId)?.handleSubagentParentAvailable(parentAvailable)
          }
        } else {
          this.catalogs.set(parentSessionId, {
            entries: this.withCatalogMutations(
              previous?.entries ?? [], expandableRows, activityRows,
            ),
            parentAvailable: this.catalogInflight.get(parentSessionId)?.parentAvailableOverride
              ?? previous?.parentAvailable ?? false,
            state: 'error',
            error: result.error,
          })
        }
      } catch (error) {
        const folded = transportError(error)
        this.catalogs.set(parentSessionId, {
          entries: this.withCatalogMutations(
            previous?.entries ?? [], expandableRows, activityRows,
          ),
          parentAvailable: this.catalogInflight.get(parentSessionId)?.parentAvailableOverride
            ?? previous?.parentAvailable ?? false,
          state: 'error',
          error: folded.ok ? null : folded.error,
        })
      } finally {
        this.catalogInflight.delete(parentSessionId)
        if (this.catalogStale.delete(parentSessionId)) void this.refreshSubagents(parentSessionId)
        this.notifier.markDirty()
      }
    })()
    this.catalogInflight.set(parentSessionId, {
      promise: operation,
      expandableRows,
      activityRows,
      parentAvailableOverride: undefined,
    })
    return operation
  }

  setSubagentCatalogOpen(parentSessionId, open) {
    if (open) {
      this.openCatalogs.add(parentSessionId)
      void this.refreshSubagents(parentSessionId)
    } else {
      this.openCatalogs.delete(parentSessionId)
      const timer = this.catalogDebounce.get(parentSessionId)
      if (timer !== undefined) {
        clearTimeout(timer)
        this.catalogDebounce.delete(parentSessionId)
      }
    }
  }


  refreshList() {
    if (this.listInflight !== null) return this.listInflight
    this.listState = 'loading'
    this.listError = null
    const established = this.summaries
    const mutations = []
    this.listMutations = mutations
    this.notifier.markDirty()
    this.listInflight = (async () => {
      try {
        const { result } = await this.api.sessions.list({})
        if (result.ok) {
          const baseline = this.listPhase === 'pending'
            ? result.value.items
            : mergeOrderedBaseline(established, result.value.items, summary => summary.sessionId)
          for (const s of baseline) {
            if (!this.prevRunning.has(s.sessionId)) this.prevRunning.set(s.sessionId, s.running)
          }
          let summaries = baseline
          for (const mutation of mutations) {
            summaries = applyMutation(summaries, mutation)
            this.summaries = summaries
            this.syncCompletedNotifications()
          }
          this.summaries = summaries
          this.listState = 'idle'
          this.listPhase = 'ready'
          this.syncCompletedNotifications()
          for (const s of this.summaries) {
            const session = this.sessions.get(s.sessionId)
            if (session === undefined) continue
            session.handleBlank(s.blank)
            session.handleRunning(s.running)
          }
          for (const s of result.value.items) {
            const block = s.projections
            if (block === undefined) continue
            const store = this.projectionStore(s.sessionId)
            const values = block.values
            for (const key of Object.keys(values)) store.apply(key, values[key], block.asOfSeq)
          }
        } else {
          this.listState = 'error'
          this.listError = result.error
        }
      } catch (error) {
        this.listState = 'error'
        const folded = transportError(error)
        this.listError = folded.ok ? null : folded.error
      } finally {
        this.listMutations = null
        this.listInflight = null
        this.notifier.markDirty()
      }
    })()
    return this.listInflight
  }

  async search(
    query,
    signal,
  ) {
    try {
      return (await this.api.sessions.search({ query }, signal)).result
    } catch (error) {
      return transportError(error)
    }
  }

  async create(
    opts = {},
  ) {
    try {
      const shared = opts.sessionId === undefined ? {} : { sessionId: opts.sessionId }
      const payload = opts.workspaceId !== undefined
        ? { workspaceId: opts.workspaceId, ...shared }
        : { ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }), ...shared }
      const { result } = await this.api.sessions.create(payload)
      if (result.ok) {
        this.recordMutation({ kind: 'upsert', summary: {
          sessionId: result.value.sessionId, updatedAt: Date.now(), running: false, blank: true,
          ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
          ...(result.value.agentPreset !== undefined ? { agentPreset: result.value.agentPreset } : {}),
        } })
      } else {
        const publishedSessionId = workspaceAttachSessionId(result.error)
        if (publishedSessionId !== undefined) {
          this.recordMutation({ kind: 'upsert', summary: {
            sessionId: publishedSessionId,
            updatedAt: Date.now(),
            running: false,
            blank: true,
          } })
        }
      }
      return result
    } catch (error) {
      return transportError(error)
    }
  }

  async fork(
    opts,
  ) {
    try {
      const source = this.summaries.find(s => s.sessionId === opts.sessionId)
      const { result } = await this.api.sessions.fork({
        sessionId: opts.sessionId,
        ...opts.atSeq === undefined ? {} : { atSeq: opts.atSeq },
      })
      const childId = result.ok
        ? result.value.sessionId
        : workspaceAttachSessionId(result.error)
      if (childId !== undefined) {
        this.recordMutation({ kind: 'upsert', summary: {
          sessionId: childId, updatedAt: Date.now(), running: false, blank: false,
          parentSessionId: opts.sessionId,
          ...(source?.cwd !== undefined ? { cwd: source.cwd } : {}),
        } })
      }
      return result
    } catch (error) {
      return transportError(error)
    }
  }

  mergeSummary(summary) {
    this.recordMutation({ kind: 'upsert', summary })
  }

  noteAgentPreset(sessionId, agentPreset) {
    this.recordMutation({ kind: 'upsert', summary: {
      sessionId, updatedAt: Date.now(), running: false, blank: true, agentPreset,
    } })
  }

  recordMutation(mutation) {
    this.listMutations?.push(mutation)
    this.summaries = applyMutation(this.summaries, mutation)
    this.syncCompletedNotifications()
    this.notifier.markDirty()
  }


  subscribe(listener) {
    return this.notifier.subscribe(listener)
  }

  getListSnapshot() {
    this.notifier.ensureFresh()
    return this.listSnapshotCache
  }

  trackPending(sessionId, key, status) {
    let interactions = this.pendingInteractions.get(sessionId)
    if (interactions === undefined) {
      interactions = new Map()
      this.pendingInteractions.set(sessionId, interactions)
    }
    if (interactions.get(key) === status) return
    interactions.set(key, status)
    this.notifier.markDirty()
  }

  resolvePending(sessionId, key) {
    const interactions = this.pendingInteractions.get(sessionId)
    if (interactions === undefined || !interactions.delete(key)) return
    if (interactions.size === 0) this.pendingInteractions.delete(sessionId)
    this.notifier.markDirty()
  }


  handleMuxEnvelope(envelope) {
    const frame = envelope.payload
    if (frame.type === 'stream/error') return
    if (
      frame.type === 'session/event'
      && frame.event.type === 'user/message'
      && frame.event.data.source.kind === 'user'
    ) {
      this.recordMutation({ kind: 'activity', sessionId: frame.sessionId, updatedAt: frame.event.time })
    }
    if (frame.type === 'session/event') this.noteActivity(frame.sessionId, frame.event)
    if (frame.type === 'session/projection') {
      this.projectionStore(frame.sessionId).apply(frame.key, frame.value, frame.seq)
      this.notifier.markDirty()
      return
    }
    if (frame.type === 'session/jobs') {
      if (frame.jobs.length === 0) this.jobsBySession.delete(frame.sessionId)
      else this.jobsBySession.set(frame.sessionId, frame.jobs)
      this.notifier.markDirty()
      return
    }
    if (frame.type === 'terminal/activity') {
      this.terminalStore(frame.sessionId).apply(frame.activity)
      this.treeActivityNotifier.markDirty()
      return
    }
    if (frame.type === 'session/subscribed') {
      this.projectionStores.get(frame.sessionId)?.truncate(frame.lastSeq)
      this.jobsBySession.delete(frame.sessionId)
      this.terminalsBySession.get(frame.sessionId)?.reset()
      this.notifier.markDirty()
      const buffered = this.pendingBuffers.get(frame.sessionId)
      if (buffered !== undefined) {
        const kept = buffered.filter(item => item.payload.type !== 'session/queue')
        if (kept.length !== buffered.length) {
          if (kept.length === 0) this.pendingBuffers.delete(frame.sessionId)
          else this.pendingBuffers.set(frame.sessionId, kept)
        }
      }
    }
    if (frame.type === 'approval/requested') {
      this.trackPending(frame.sessionId, `a:${frame.approvalId}`, 'approval')
    } else if (frame.type === 'approval/resolved') {
      this.resolvePending(frame.sessionId, `a:${frame.approvalId}`)
    } else if (frame.type === 'question/requested') {
      this.trackPending(
        frame.sessionId,
        `q:${envelope.rpcId}`,
        questionInteractionStatus(frame.questions),
      )
    } else if (frame.type === 'question/resolved') {
      this.resolvePending(frame.sessionId, `q:${frame.questionRpcId}`)
    }
    const session = this.sessions.get(frame.sessionId)
    if (session === undefined) {
      switch (frame.type) {
        case 'approval/requested':
        case 'question/requested':
        case 'session/queue': {
          const buffer = this.pendingBuffers.get(frame.sessionId) ?? []
          const key = frame.type === 'approval/requested'
            ? `a:${frame.approvalId}`
            : frame.type === 'question/requested' ? `q:${envelope.rpcId}` : 'queue'
          const prior = buffer.findIndex(item => bufferedRequestKey(item) === key)
          if (prior === -1) buffer.push(envelope)
          else buffer[prior] = envelope
          this.pendingBuffers.set(frame.sessionId, buffer)
          return
        }
        case 'approval/resolved':
        case 'question/resolved': {
          const buffer = this.pendingBuffers.get(frame.sessionId)
          if (buffer === undefined) return
          const key = frame.type === 'approval/resolved'
            ? `a:${frame.approvalId}`
            : `q:${frame.questionRpcId}`
          const prior = buffer.findIndex(item => bufferedRequestKey(item) === key)
          if (prior !== -1) buffer.splice(prior, 1)
          if (buffer.length === 0) this.pendingBuffers.delete(frame.sessionId)
          return
        }
        default:
          return
      }
    }
    session.handleMuxEnvelope(envelope.rpcId, frame)
  }

  handleHostEnvelope(envelope) {
    const frame = envelope.payload
    switch (frame.type) {
      case 'host/session-added': {
        this.mergeSummary({
          sessionId: frame.sessionId, updatedAt: Date.now(), running: false, blank: frame.blank,
          ...(frame.parentSessionId !== undefined ? { parentSessionId: frame.parentSessionId } : {}),
          ...(frame.origin !== undefined ? { origin: frame.origin } : {}),
          ...(frame.cwd !== undefined ? { cwd: frame.cwd } : {}),
          ...(frame.agentPreset !== undefined ? { agentPreset: frame.agentPreset } : {}),
        })
        this.sessions.get(frame.sessionId)?.handleBlank(frame.blank)
        if (frame.origin === 'subagent' && frame.parentSessionId !== undefined) {
          this.markCatalogParentExpandable(frame.parentSessionId)
        }
        if (frame.parentSessionId !== undefined
          && (this.selected === frame.parentSessionId || this.openCatalogs.has(frame.parentSessionId))) {
          this.scheduleCatalogRefresh(frame.parentSessionId)
        }
        return
      }
      case 'host/session-removed': {
        const summary = this.summaries.find(candidate => candidate.sessionId === frame.sessionId)
        const durableSubagent = summary?.origin === 'subagent' || this.addresses.has(frame.sessionId)
        this.recordMutation(durableSubagent
          ? { kind: 'status', sessionId: frame.sessionId, running: false }
          : { kind: 'remove', sessionId: frame.sessionId })
        this.updateCatalogActivity(frame.sessionId, false)
        if (durableSubagent) {
          this.sessions.get(frame.sessionId)?.handleRunning(false)
        } else {
          this.sessions.get(frame.sessionId)?.handleRemoved()
        }
        this.pendingBuffers.delete(frame.sessionId)
        this.pendingInteractions.delete(frame.sessionId)
        this.jobsBySession.delete(frame.sessionId)
        if (!durableSubagent) this.clearTreeActivity(frame.sessionId)
        if (!durableSubagent) this.projectionStores.delete(frame.sessionId)
        const inflightCatalog = this.catalogInflight.get(frame.sessionId)
        if (inflightCatalog !== undefined) {
          inflightCatalog.parentAvailableOverride = false
          this.catalogStale.add(frame.sessionId)
        }
        const ownedCatalog = this.catalogs.get(frame.sessionId)
        if (ownedCatalog !== undefined && ownedCatalog.parentAvailable) {
          this.catalogs.set(frame.sessionId, { ...ownedCatalog, parentAvailable: false })
        }
        for (const [childId, address] of this.addresses) {
          if (address.parentSessionId !== frame.sessionId) continue
          this.sessions.get(childId)?.handleSubagentParentAvailable(false)
        }
        return
      }
      case 'host/session-status': {
        this.recordMutation({
          kind: 'status',
          sessionId: frame.sessionId,
          running: frame.running,
          ...frame.errored === undefined ? {} : { errored: frame.errored },
        })
        this.sessions.get(frame.sessionId)?.handleRunning(frame.running)
        this.updateCatalogActivity(frame.sessionId, frame.running)
        return
      }
      case 'host/agent-error': {
        this.sessions.get(frame.sessionId)?.handleAgentError(frame.message)
        return
      }
      default:
        return
    }
  }

  handleDisconnected() {
    if (this.pendingInteractions.size > 0) {
      this.pendingInteractions.clear()
      this.notifier.markDirty()
    }
    for (const [sessionId, buffer] of [...this.pendingBuffers]) {
      const kept = buffer.filter(item =>
        item.payload.type !== 'approval/requested' && item.payload.type !== 'question/requested')
      if (kept.length === buffer.length) continue
      if (kept.length === 0) this.pendingBuffers.delete(sessionId)
      else this.pendingBuffers.set(sessionId, kept)
    }
  }

  handleConnected() {
    void this.refreshList()
    const selectedAddress = this.selected === undefined ? undefined : this.addresses.get(this.selected)
    if (selectedAddress !== undefined) void this.refreshSubagents(selectedAddress.parentSessionId)
    if (this.selected !== undefined) void this.refreshSubagents(this.selected)
    for (const parentSessionId of this.openCatalogs) void this.refreshSubagents(parentSessionId)
    for (const session of this.sessions.values()) void session.resync()
  }

  scheduleCatalogRefresh(parentSessionId) {
    if (this.catalogDebounce.has(parentSessionId)) return
    const timer = setTimeout(() => {
      this.catalogDebounce.delete(parentSessionId)
      if (this.catalogInflight.has(parentSessionId)) {
        this.catalogStale.add(parentSessionId)
        return
      }
      void this.refreshSubagents(parentSessionId)
    }, 50)
    this.catalogDebounce.set(parentSessionId, timer)
  }

  updateCatalogActivity(childSessionId, running) {
    const activity = running ? 'running' : 'inactive'
    for (const inflight of this.catalogInflight.values()) {
      inflight.activityRows.set(childSessionId, activity)
    }
    let changed = false
    for (const [parentSessionId, catalog] of this.catalogs) {
      if (!catalog.entries.some(entry =>
        entry.kind === 'child' && entry.id === childSessionId && entry.activity !== activity)) continue
      const entries = catalog.entries.map((entry) => {
        if (entry.kind !== 'child' || entry.id !== childSessionId) return entry
        return { ...entry, activity }
      })
      changed = true
      this.catalogs.set(parentSessionId, { ...catalog, entries })
    }
    if (changed) this.notifier.markDirty()
  }

  markCatalogParentExpandable(parentSessionId) {
    this.applyCatalogParentExpandable(parentSessionId)
    for (const inflight of this.catalogInflight.values()) inflight.expandableRows.add(parentSessionId)
  }

  applyCatalogParentExpandable(parentSessionId) {
    let changed = false
    for (const [catalogParentId, catalog] of this.catalogs) {
      if (!catalog.entries.some(entry =>
        entry.kind === 'child' && entry.id === parentSessionId && !entry.hasChildren)) continue
      const entries = catalog.entries.map((entry) => {
        if (entry.kind !== 'child' || entry.id !== parentSessionId || entry.hasChildren) return entry
        return { ...entry, hasChildren: true }
      })
      changed = true
      this.catalogs.set(catalogParentId, { ...catalog, entries })
    }
    if (changed) this.notifier.markDirty()
  }

  withCatalogMutations(
    entries,
    expandableRows,
    activityRows,
  ) {
    return entries.map((entry) => {
      if (entry.kind !== 'child') return entry
      const activity = activityRows.get(entry.id)
      if (!expandableRows.has(entry.id) && activity === undefined) return entry
      return {
        ...entry,
        ...expandableRows.has(entry.id) ? { hasChildren: true } : {},
        ...activity === undefined ? {} : { activity },
      }
    })
  }

  syncCompletedNotifications() {
    const seen = new Set()
    for (const s of this.summaries) {
      seen.add(s.sessionId)
      const prev = this.prevRunning.get(s.sessionId)
      if (prev === undefined) {
        this.prevRunning.set(s.sessionId, s.running)
        continue
      }
      if (prev && !s.running) {
        if (s.sessionId !== this.selected) this.completedNotifications.add(s.sessionId)
      } else if (s.running) {
        this.completedNotifications.delete(s.sessionId)
      }
      this.prevRunning.set(s.sessionId, s.running)
    }
    for (const id of this.prevRunning.keys()) {
      if (!seen.has(id)) this.prevRunning.delete(id)
    }
    for (const id of this.completedNotifications) {
      if (!seen.has(id)) this.completedNotifications.delete(id)
    }
  }

  buildListSnapshot() {
    const merged = this.summaries.map((summary) => {
      const projectionStore = this.projectionStores.get(summary.sessionId)
      const title = projectionStore?.get('title')
      const projectionValues = projectionStore?.values()
      return {
        ...summary,
        ...(typeof title === 'string' && title !== '' ? { title } : {}),
        ...(projectionValues === undefined ? {} : { projectionValues }),
      }
    })
    const pendingInteractions = new Map()
    for (const [sessionId, interactions] of this.pendingInteractions) {
      const status = composerLeadingStatus([...interactions.values()])
      if (status !== undefined) pendingInteractions.set(sessionId, status)
    }
    const fresh = flattenLineage(merged, pendingInteractions, this.completedNotifications)
    const items = fresh.map((entry) => {
      const prev = this.entryCache.get(entry.sessionId)
      if (
        prev !== undefined && prev.updatedAt === entry.updatedAt && prev.running === entry.running
        && prev.blank === entry.blank && prev.agentPreset === entry.agentPreset
        && prev.parentSessionId === entry.parentSessionId && prev.cwd === entry.cwd
        && prev.origin === entry.origin && prev.title === entry.title && prev.depth === entry.depth
        && prev.pendingInteraction === entry.pendingInteraction
        && prev.projectionValues === entry.projectionValues
        && prev.completed === entry.completed
        && prev.errored === entry.errored
        && prev.readOnly === entry.readOnly
      ) return prev
      this.entryCache.set(entry.sessionId, entry)
      return entry
    })
    for (const id of this.entryCache.keys()) {
      if (!items.some(e => e.sessionId === id)) this.entryCache.delete(id)
    }
    const sameOrder = items.length === this.itemsCache.length && items.every((e, i) => e === this.itemsCache[i])
    if (!sameOrder) this.itemsCache = items
    const selected = this.selected
    const current = selected !== undefined
      && (items.some(item => item.sessionId === selected) || this.addresses.has(selected))
      ? selected
      : undefined
    return {
      items: this.itemsCache,
      current,
      state: this.listState,
      phase: this.listPhase,
      error: this.listError,
      subagentsByParent: Object.fromEntries(this.catalogs),
      jobsBySession: Object.fromEntries(this.jobsBySession),
      currentAddress: current === undefined ? undefined : this.addresses.get(current),
    }
  }
}

function applyMutation(summaries, mutation) {
  switch (mutation.kind) {
    case 'upsert': {
      const existing = summaries.find(summary => summary.sessionId === mutation.summary.sessionId)
      if (existing === undefined) return [mutation.summary, ...summaries]
      const filled = {
        ...existing,
        blank: existing.blank && mutation.summary.blank,
        ...(existing.cwd === undefined && mutation.summary.cwd !== undefined ? { cwd: mutation.summary.cwd } : {}),
        ...(existing.parentSessionId === undefined && mutation.summary.parentSessionId !== undefined
          ? { parentSessionId: mutation.summary.parentSessionId } : {}),
        ...(existing.origin === undefined && mutation.summary.origin !== undefined
          ? { origin: mutation.summary.origin } : {}),
        ...(mutation.summary.agentPreset !== undefined
          ? { agentPreset: mutation.summary.agentPreset } : {}),
      }
      if (filled.cwd === existing.cwd && filled.parentSessionId === existing.parentSessionId
        && filled.origin === existing.origin && filled.blank === existing.blank
        && filled.agentPreset === existing.agentPreset) return [...summaries]
      return summaries.map(summary => summary.sessionId === mutation.summary.sessionId ? filled : summary)
    }
    case 'remove':
      return summaries.filter(summary => summary.sessionId !== mutation.sessionId)
    case 'status':
      return summaries.map(summary => summary.sessionId === mutation.sessionId
        && (summary.running !== mutation.running || (mutation.running && summary.blank)
          || (mutation.errored !== undefined && mutation.errored !== summary.errored))
        ? {
          ...summary,
          running: mutation.running,
          blank: summary.blank && !mutation.running,
          ...mutation.errored === undefined ? {} : { errored: mutation.errored },
        }
        : summary)
    case 'activity':
      return summaries.map(summary => summary.sessionId === mutation.sessionId
        && mutation.updatedAt > summary.updatedAt
        ? { ...summary, updatedAt: mutation.updatedAt }
        : summary)
    case 'engaged':
      return summaries.map(summary => summary.sessionId === mutation.sessionId && summary.blank
        ? { ...summary, blank: false }
        : summary)
  }
}

function workspaceAttachSessionId(error) {
  const candidate = error
  return candidate.code === 'workspace-attach-failed' ? candidate.details.sessionId : undefined
}
