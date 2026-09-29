
import { createSnapshotStore } from '../contract/store.js'
import { WorkspaceManager } from './manager.js'

export class WorkspaceCreateError extends Error {
  constructor(rpcError) {
    super(`workspace create failed: ${rpcError.code}: ${rpcError.message}`)
    this.rpcError = rpcError
    this.name = 'WorkspaceCreateError'
  }
}

export class DirectoryBrowseError extends Error {
  constructor(rpcError) {
    super(`directory browse failed: ${rpcError.code}: ${rpcError.message}`)
    this.rpcError = rpcError
    this.name = 'DirectoryBrowseError'
  }
}

export class WorkspaceRuntime {
  list
  manager
  connecting = new Map()
  initialSelectionStarted = false

  constructor(ctx, api, sessions) {
    this.api = api
    this.sessions = sessions
    this.manager = new WorkspaceManager(api)
    this.list = createSnapshotStore({
      items: [], archivedSessionIds: [], state: 'idle', phase: 'pending', error: null,
      baselinesReady: false, recentWorkspaceId: undefined,
    })
    this.manager.subscribe(() => { this.project() })
    this.sessions.list.subscribe(() => { this.project() })
    ctx.reflect.provide('workspaces', this, undefined)
  }

  async connectWorkspace(workspaceId) {
    const workspace = this.list.getSnapshot().items.find(item => item.workspaceId === workspaceId)
    if (workspace === undefined) throw new Error(`workspaces.connectWorkspace: unknown workspace ${workspaceId}`)
    const inflight = this.connecting.get(workspaceId)
    if (inflight !== undefined) return inflight
    const archived = this.list.getSnapshot().archivedSessionIds
    const sessions = this.sessions.list.getSnapshot()
    for (const id of sessions.ids) {
      const summary = sessions.byId[id]
      if (summary !== undefined && summary.blank && summary.cwd === workspace.path
        && workspace.sessionIds.includes(summary.id)
        && !archived.includes(summary.id)) return summary.id
    }
    const attempt = this.sessions.create({ workspaceId })
      .finally(() => { this.connecting.delete(workspaceId) })
    this.connecting.set(workspaceId, attempt)
    return attempt
  }

  startInitialSelection() {
    if (this.initialSelectionStarted) {
      throw new Error('workspaces.startInitialSelection: already started')
    }
    this.initialSelectionStarted = true
    let state = 'waiting'
    let disposed = false
    const reconcile = () => {
      if (disposed || state !== 'waiting') return
      const workspace = this.list.getSnapshot()
      if (!workspace.baselinesReady) return
      const current = this.sessions.list.getSnapshot().current
      const target = workspace.recentWorkspaceId
      if (current !== undefined || target === undefined) {
        state = 'done'
        return
      }
      state = 'connecting'
      void this.connectWorkspace(target).then(
        (sessionId) => {
          if (disposed) return
          if (this.sessions.list.getSnapshot().current === undefined) {
            this.sessions.open(sessionId)
          }
          state = 'done'
        },
        (reason) => {
          if (disposed) return
          state = 'waiting'
          console.warn('initial workspace selection failed:', reason)
        },
      )
    }
    const unsubscribe = this.list.subscribe(reconcile)
    reconcile()
    return () => {
      disposed = true
      unsubscribe()
    }
  }

  startSession(workspaceId) {
    const workspace = this.list.getSnapshot()
    const current = this.sessions.list.getSnapshot().current
    const currentWorkspaceId = current === undefined
      ? undefined
      : workspace.items.find(item => item.sessionIds.includes(current))?.workspaceId
    const target = workspaceId ?? currentWorkspaceId ?? workspace.recentWorkspaceId
    if (target === undefined) {
      this.sessions.clear()
      return
    }
    void this.connectWorkspace(target).then(
      (sessionId) => { this.sessions.open(sessionId) },
      (reason) => { console.warn('new session failed:', reason) },
    )
  }

  async create(input) {
    const result = await this.manager.create(input)
    if (!result.ok) throw new WorkspaceCreateError(result.error)
    return result.value.workspace
  }

  async pickDirectory() {
    const response = await this.api.host.pickDirectory({})
    if (!response.result.ok) {
      throw new Error(`directory picker failed: ${response.result.error.message}`)
    }
    return response.result.value.path
  }

  async listDirectory(path, signal) {
    const response = await this.api.host.listDirectory(path === undefined ? {} : { path }, signal)
    if (!response.result.ok) throw new DirectoryBrowseError(response.result.error)
    return response.result.value
  }

  async createDirectory(path, name) {
    const response = await this.api.host.createDirectory({ path, name })
    if (!response.result.ok) throw new DirectoryBrowseError(response.result.error)
    return response.result.value.path
  }

  async openPath(path) {
    const response = await this.api.host.openPath({ path })
    if (!response.result.ok) {
      throw new Error(`path open failed: ${response.result.error.message}`)
    }
  }

  async rename(workspaceId, title) {
    const result = await this.manager.rename(workspaceId, title)
    if (!result.ok) throw new Error(`workspace rename failed: ${result.error.code}: ${result.error.message}`)
    return result.value.workspace
  }

  async delete(workspaceId) {
    const result = await this.manager.delete(workspaceId)
    if (!result.ok) throw new Error(`workspace delete failed: ${result.error.code}: ${result.error.message}`)
  }

  async insertBefore(workspaceId, beforeWorkspaceId) {
    const result = await this.manager.insertBefore(workspaceId, beforeWorkspaceId)
    if (!result.ok) throw new Error(`workspace reorder failed: ${result.error.code}: ${result.error.message}`)
  }

  async archiveSession(sessionId) {
    const result = await this.manager.archiveSession(sessionId)
    if (!result.ok) throw new Error(`session archive failed: ${result.error.code}: ${result.error.message}`)
  }

  async insertSessionBefore(
    workspaceId,
    sessionId,
    beforeSessionId,
  ) {
    const result = await this.manager.insertSessionBefore(workspaceId, sessionId, beforeSessionId)
    if (!result.ok) throw new Error(`workspace move failed: ${result.error.code}: ${result.error.message}`)
    return result.value.workspace
  }

  refresh() {
    return this.manager.refresh()
  }

  handleHostEnvelope(envelope) {
    this.manager.handleHostEnvelope(envelope)
  }

  handleConnected() {
    this.manager.handleConnected()
  }

  project() {
    const workspace = this.manager.getSnapshot()
    const sessions = this.sessions.list.getSnapshot()
    const baselinesReady = workspace.phase === 'ready' && sessions.phase === 'ready'
    if (sessions.current !== undefined && workspace.archivedSessionIds.includes(sessions.current)) {
      this.sessions.clear()
    }
    this.list.set({
      items: workspace.items,
      archivedSessionIds: workspace.archivedSessionIds,
      state: workspace.state,
      phase: workspace.phase,
      error: workspace.error,
      baselinesReady,
      recentWorkspaceId: baselinesReady ? recentWorkspace(workspace.items, sessions.byId) : undefined,
    })
  }
}

function recentWorkspace(
  workspaces,
  sessions,
) {
  let selected
  let selectedTime = Number.NEGATIVE_INFINITY
  for (const workspace of workspaces) {
    let latest = Number.NEGATIVE_INFINITY
    for (const sessionId of workspace.sessionIds) {
      const session = sessions[sessionId]
      if (session !== undefined) latest = Math.max(latest, session.updatedAt)
    }
    if (latest === Number.NEGATIVE_INFINITY) latest = Date.parse(workspace.createdAt)
    if (selected === undefined || latest > selectedTime) {
      selected = workspace.workspaceId
      selectedTime = latest
    }
  }
  return selected
}
