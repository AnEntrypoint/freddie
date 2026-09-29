import { SESSION_SEARCH_RESULT_LIMIT } from '@freddie/freddie-host-apiproxy/api'
import { createSnapshotStore } from '../contract/store.js'
import { createScope, scopeOf as scopeTagOf } from '../agents/scope.js'
import { SessionManager } from './manager.js'
import { SessionProvideChannel } from './provide.js'
import { loadUserPrompts } from './user-prompts.js'

export class SessionCreateError extends Error {
  name = 'SessionCreateError'

  constructor(
    rpcError,
    requestedSessionId,
  ) {
    super(`session create failed: ${rpcError.code}: ${rpcError.message}`)
    this.rpcError = rpcError
    this.requestedSessionId = requestedSessionId
  }
}

export class SessionForkError extends Error {
  name = 'SessionForkError'

  constructor(
    rpcError,
    sourceSessionId,
  ) {
    super(`session fork failed: ${rpcError.code}: ${rpcError.message}`)
    this.rpcError = rpcError
    this.sourceSessionId = sourceSessionId
  }
}

export { scopeOf } from '../agents/scope.js'

export function workspaceTitleOf(cwd) {
  return cwd.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? ''
}

function displayTitleOf(title, cwd, id) {
  if (title !== undefined) return title
  if (cwd !== undefined && cwd !== '') {
    const base = workspaceTitleOf(cwd)
    if (base !== '') return base
  }
  return id
}

function increasedForkTitle(title) {
  const ascii = /^(.*?)\((\d+)\)$/u.exec(title)
  if (ascii?.[1] !== undefined && ascii[2] !== undefined) {
    return `${ascii[1]}(${BigInt(ascii[2]) + 1n})`
  }
  const fullWidth = /^(.*?)\uff08(\d+)\uff09$/u.exec(title)
  if (fullWidth?.[1] !== undefined && fullWidth[2] !== undefined) {
    return `${fullWidth[1]}\uff08${BigInt(fullWidth[2]) + 1n}\uff09`
  }
  return `${title} (1)`
}

export class SessionRuntime {
  searchResultLimit = SESSION_SEARCH_RESULT_LIMIT
  list
  manager
  currentProvideInfo

  selection

  scopes = new Map()
  provideChannel
  watched
  deferredRemovals = new Set()

  constructor(
    rootCtx,
    api,
    remote,
    conversationRuntime,
  ) {
    this.rootCtx = rootCtx
    this.selection = createSnapshotStore(
      {},
      { persist: { name: 'dsh.sessions.current' } })
    const restored = this.selection.getSnapshot()
    const conversationEvents = rootCtx.get('conversationEvents')
    const conversationViews = rootCtx.get('conversationViews')
    const conversation = conversationRuntime ?? (
      conversationEvents === undefined || conversationViews === undefined
        ? undefined
        : { events: conversationEvents, views: conversationViews }
    )
    this.manager = new SessionManager(
      api,
      remote,
      restored.sessionId,
      restored.subagentAddress,
      conversation,
    )
    this.list = createSnapshotStore({
      ids: [], byId: {}, current: undefined, phase: 'pending',
      subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    })
    this.manager.subscribe(() => { this.projectList() })
    this.list.subscribe(() => {
      this.followCurrent()
      this.provideChannel.publishCurrent()
    })
    this.provideChannel = new SessionProvideChannel({
      rebuildBundles: () => {
        for (const record of this.scopes.values()) {
          record.provideInfo = this.provideChannel.materializeInfo(record.binding)
        }
      },
      resolveCurrent: () => this.maybeProvideInfo(this.list.getSnapshot().current),
    })
    this.currentProvideInfo = this.provideChannel.currentProvideInfo
    let registryRebuildQueued = false
    const scheduleRegistryRebuild = () => {
      if (registryRebuildQueued) return
      registryRebuildQueued = true
      queueMicrotask(() => {
        registryRebuildQueued = false
        this.manager.rebuildConversationRegistry()
      })
    }
    if (conversation !== undefined) {
      rootCtx.effect(() => {
        const disposeEvents = conversation.events.subscribe(scheduleRegistryRebuild)
        const disposeViews = conversation.views.subscribe(scheduleRegistryRebuild)
        return () => {
          disposeEvents()
          disposeViews()
        }
      }, 'sessions: conversation registry rebuild')
    }
    rootCtx.reflect.provide('sessions', this, undefined)
  }

  provide(descriptor) {
    return this.provideChannel.provide(descriptor)
  }

  open(id) {
    this.manager.select(id)
  }

  openSubagent(address) {
    this.manager.selectSubagent(address)
  }

  subagentAddress(id) {
    return this.manager.subagentAddress(id)
  }

  terminalActivity(sessionId) {
    return this.manager.terminalStore(sessionId)
  }

  noteTerminalActivity(sessionId, activity) {
    this.manager.terminalStore(sessionId).apply(activity)
  }

  treeActivity() {
    return this.manager.treeActivitySource()
  }

  treeTerminals() {
    return this.manager.treeTerminalSource()
  }

  setSubagentCatalogOpen(parentSessionId, open) {
    this.manager.setSubagentCatalogOpen(parentSessionId, open)
  }

  refreshSubagents(parentSessionId) {
    return this.manager.refreshSubagents(parentSessionId)
  }

  noteAgentPreset(sessionId, agentPreset) {
    this.manager.noteAgentPreset(sessionId, agentPreset)
  }

  clear() {
    this.manager.clearSelection()
  }

  refresh() {
    return this.manager.refreshList()
  }

  search(
    query,
    signal,
  ) {
    return this.manager.search(query, signal)
  }

  userPrompts(id) {
    return loadUserPrompts(this.manager.api, id)
  }

  handleMuxEnvelope(envelope) {
    this.manager.handleMuxEnvelope(envelope)
  }

  handleHostEnvelope(envelope) {
    this.manager.handleHostEnvelope(envelope)
  }

  handleConnected() {
    this.manager.handleConnected()
  }

  handleDisconnected() {
    this.manager.handleDisconnected()
  }

  async create(opts = {}) {
    const result = await this.manager.create(opts)
    if (!result.ok) throw new SessionCreateError(result.error, opts.sessionId)
    this.projectList()
    return result.value.sessionId
  }

  async fork(opts) {
    const sourceTitle = opts.increaseTitle
      ? this.list.getSnapshot().byId[opts.sessionId]?.title
      : undefined
    const result = await this.manager.fork({
      sessionId: opts.sessionId,
      ...(opts.atSeq === undefined ? {} : { atSeq: Math.floor(opts.atSeq) }),
    })
    if (!result.ok) throw new SessionForkError(result.error, opts.sessionId)
    this.projectList()
    const childId = result.value.sessionId
    if (sourceTitle !== undefined) {
      const child = this.binding(childId)?.session
      if (child === undefined) throw new Error(`fork child "${childId}" is not locally addressable`)
      const renamed = await child.rename(increasedForkTitle(sourceTitle))
      if (!renamed.ok) throw new Error(`fork child rename failed: ${renamed.error.code}: ${renamed.error.message}`)
    }
    return childId
  }

  scope(id) {
    return this.resolve(id)?.ctx
  }

  scopeOf(ctx) {
    return scopeTagOf(ctx)
  }

  sessionOf(ctx) {
    const id = scopeTagOf(ctx)
    if (id === undefined) return undefined
    return this.scopes.get(id)?.binding.session
  }

  binding(id) {
    return this.resolve(id)?.binding
  }

  provideInfo(id) {
    return this.resolve(id)?.provideInfo
  }

  maybeProvideInfo(id) {
    return (id === undefined ? undefined : this.provideInfo(id)) ?? this.provideChannel.maybeInfo
  }

  followCurrent() {
    const snapshot = this.list.getSnapshot()
    const current = snapshot.current
    if (current === undefined || snapshot.byId[current] === undefined || current === this.watched) return
    this.watched = current
    this.sweepDeferred()
    const record = this.resolve(current)
    if (record !== undefined) {
      void record.session.open()
      void this.manager.refreshSubagents(current)
    }
  }

  resolve(id) {
    const existing = this.scopes.get(id)
    if (existing !== undefined) return existing
    if (!this.eligible(id)) return undefined
    const { fiber, ctx } = createScope(this.rootCtx, id)
    const session = this.manager.get(id)
    session.bindScope(ctx)
    const binding = { sessionId: id, session, ctx }
    const record = {
      fiber,
      ctx,
      binding,
      session,
      provideInfo: this.provideChannel.materializeInfo(binding),
    }
    this.scopes.set(id, record)
    return record
  }

  eligible(id) {
    const { ids, current } = this.list.getSnapshot()
    return current === id || ids.includes(id)
  }

  projectList() {
    const {
      items, current, phase, subagentsByParent, jobsBySession, currentAddress,
    } = this.manager.getListSnapshot()
    const ids = []
    const byId = {}
    for (const entry of items) {
      ids.push(entry.sessionId)
      byId[entry.sessionId] = {
        id: entry.sessionId,
        displayTitle: displayTitleOf(entry.title, entry.cwd, entry.sessionId),
        running: entry.running,
        ...(entry.completed ? { completed: true } : {}),
        blank: entry.blank,
        updatedAt: entry.updatedAt,
        ...(entry.pendingInteraction === undefined
          ? {}
          : { pendingInteraction: entry.pendingInteraction }),
        ...(entry.projectionValues === undefined
          ? {}
          : { projectionValues: entry.projectionValues }),
        ...(entry.title !== undefined ? { title: entry.title } : {}),
        ...(entry.cwd !== undefined ? { cwd: entry.cwd } : {}),
        ...(entry.parentSessionId !== undefined ? { parentId: entry.parentSessionId } : {}),
        ...(entry.origin !== undefined ? { origin: entry.origin } : {}),
        ...(entry.agentPreset !== undefined ? { agentPreset: entry.agentPreset } : {}),
        ...(entry.readOnly === true ? { readOnly: true } : {}),
      }
    }
    if (current !== undefined && currentAddress !== undefined) {
      const seen = new Set()
      let address = currentAddress
      while (address !== undefined && !seen.has(address.childSessionId)) {
        const childId = address.childSessionId
        seen.add(childId)
        const child = subagentsByParent[address.parentSessionId]?.entries
          .find(entry => entry.kind === 'child' && entry.id === childId)
        if (child?.kind !== 'child') break
        const displayTitle = child.label ?? childId
        const summary = byId[childId]
        if (summary === undefined) {
          byId[childId] = {
            id: childId,
            displayTitle,
            parentId: address.parentSessionId,
            origin: 'subagent',
            running: child.activity === 'running',
            blank: false,
            updatedAt: 0,
          }
        } else if (summary.displayTitle !== displayTitle) {
          byId[childId] = { ...summary, displayTitle }
        }
        const parent = byId[address.parentSessionId]
        if (parent !== undefined && parent.origin !== 'subagent') break
        address = this.manager.navigationAddress(address.parentSessionId)
      }
    }
    const persisted = this.selection.getSnapshot().sessionId
    if (current === undefined) {
      if (persisted !== undefined) this.selection.set({})
    } else if (byId[current] !== undefined
      && (persisted !== current
        || this.selection.getSnapshot().subagentAddress?.childSessionId !== currentAddress?.childSessionId
        || this.selection.getSnapshot().subagentAddress?.parentSessionId !== currentAddress?.parentSessionId
        || this.selection.getSnapshot().subagentAddress?.mode !== currentAddress?.mode)) {
      this.selection.set({
        sessionId: current,
        ...(currentAddress === undefined ? {} : { subagentAddress: currentAddress }),
      })
    }
    this.list.set({ ids, byId, current, phase, subagentsByParent, jobsBySession, currentAddress })
    this.pruneScopes()
  }

  pruneScopes() {
    for (const [id, record] of this.scopes) {
      if (this.eligible(id)) continue
      if (id === this.watched) {
        this.deferredRemovals.add(id)
        continue
      }
      this.scopes.delete(id)
      this.deferredRemovals.delete(id)
      this.dropScope(id, record)
    }
  }

  dropScope(id, record) {
    void record.fiber.dispose()
    record.session.unbindScope()
    this.rootCtx.get('slots')?.pruneStoreScope(id)
    this.manager.drop(id)
  }

  sweepDeferred() {
    for (const id of [...this.deferredRemovals]) {
      if (id === this.watched) continue
      if (this.eligible(id)) {
        this.deferredRemovals.delete(id)
        continue
      }
      const record = this.scopes.get(id)
      this.deferredRemovals.delete(id)
      if (record !== undefined) {
        this.scopes.delete(id)
        this.dropScope(id, record)
      }
    }
  }
}
