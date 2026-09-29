
import { transportError } from '@freddie/freddie-host-apiproxy/api'
import { Notifier } from '../sessions/notifier.js'
import { Workspace } from './workspace.js'

export class WorkspaceManager {
  items = []
  itemViewsSource = null
  itemViewsCache = []
  archivedSessionIds = []
  state = 'idle'
  phase = 'pending'
  error = null
  inflight = null
  refreshFrames = null
  archivedSupersedesRefresh = false
  orderRequestGeneration = 0
  orderFrameGeneration = 0
  committedOrder = []
  removedIds = new Set()
  snapshotCache
  notifier = new Notifier(() => {
    this.snapshotCache = this.buildSnapshot()
  })

  constructor(api) {
    this.api = api
    this.snapshotCache = this.buildSnapshot()
  }

  refresh() {
    if (this.inflight !== null) return this.inflight
    this.state = 'loading'
    this.error = null
    const frames = []
    this.refreshFrames = frames
    this.notifier.markDirty()
    this.inflight = (async () => {
      try {
        const { result } = await this.api.workspace.list({})
        if (result.ok) {
          let items = result.value.items
          items = items.filter(workspace => !this.removedIds.has(workspace.workspaceId))
          for (const delta of frames) items = applyWorkspaceDelta(items, delta)
          this.installViews(items)
          if (!this.archivedSupersedesRefresh) this.installArchived(result.value.archivedSessionIds)
          this.state = 'idle'
          this.phase = 'ready'
        } else {
          this.state = 'error'
          this.error = result.error
        }
      } catch (error) {
        this.state = 'error'
        const folded = transportError(error)
        /* v8 ignore next */
        this.error = folded.ok ? null : folded.error
      } finally {
        this.refreshFrames = null
        this.archivedSupersedesRefresh = false
        this.inflight = null
        this.notifier.markDirty()
      }
    })()
    return this.inflight
  }

  async create(input) {
    const workspace = new Workspace(this.api, input)
    const completion = workspace.materialize()
    if (completion === undefined) throw new Error('a local Workspace must be materializable')
    const result = await completion
    if (result.ok) this.upsert(result.value.workspace, workspace)
    return result
  }

  async rename(workspaceId, title) {
    const { result } = await this.api.workspace.rename({ workspaceId, title })
    if (result.ok) this.upsert(result.value.workspace)
    return result
  }

  async delete(workspaceId) {
    const { result } = await this.api.workspace.delete({ workspaceId })
    if (result.ok) this.remove(workspaceId, true)
    return result
  }

  async insertBefore(
    workspaceId,
    beforeWorkspaceId,
  ) {
    const requestGeneration = ++this.orderRequestGeneration
    const frameGeneration = this.orderFrameGeneration
    const localOrder = this.itemViews().map(workspace => workspace.workspaceId)
    this.installOrder(insertIdBefore(localOrder, workspaceId, beforeWorkspaceId))
    let result
    try {
      ;({ result } = await this.api.workspace.insertBefore({
        workspaceId,
        ...beforeWorkspaceId === undefined ? {} : { beforeWorkspaceId },
      }))
    } catch (error) {
      if (requestGeneration === this.orderRequestGeneration
        && frameGeneration === this.orderFrameGeneration) {
        this.installOrder(this.committedOrder)
      }
      throw error
    }
    if (result.ok && requestGeneration === this.orderRequestGeneration
      && frameGeneration === this.orderFrameGeneration) {
      this.installOrder(result.value.workspaceIds, true)
    } else if (!result.ok && requestGeneration === this.orderRequestGeneration
      && frameGeneration === this.orderFrameGeneration) {
      this.installOrder(this.committedOrder)
    }
    return result
  }

  async insertSessionBefore(
    workspaceId,
    sessionId,
    beforeSessionId,
  ) {
    const { result } = await this.api.workspace.insertSessionBefore({
      workspaceId, sessionId,
      ...beforeSessionId === undefined ? {} : { beforeSessionId },
    })
    if (result.ok) this.upsert(result.value.workspace)
    return result
  }

  async archiveSession(sessionId) {
    const { result } = await this.api.workspace.archiveSession({ sessionId })
    if (result.ok) this.installArchived(result.value.archivedSessionIds)
    return result
  }

  handleHostEnvelope(envelope) {
    if (envelope.payload.type === 'host/workspace-changed') this.upsert(envelope.payload.workspace)
    else if (envelope.payload.type === 'host/workspace-removed') this.remove(envelope.payload.workspaceId)
    else if (envelope.payload.type === 'host/workspace-order-changed') {
      this.orderFrameGeneration++
      this.installOrder(envelope.payload.workspaceIds, true)
    }
    else if (envelope.payload.type === 'host/archived-sessions-changed') {
      this.installArchived(envelope.payload.archivedSessionIds)
    }
  }

  handleConnected() {
    void this.refresh()
  }

  subscribe(listener) {
    return this.notifier.subscribe(listener)
  }

  getSnapshot() {
    this.notifier.ensureFresh()
    return this.snapshotCache
  }

  buildSnapshot() {
    return {
      items: this.itemViews(),
      archivedSessionIds: this.archivedSessionIds,
      state: this.state,
      phase: this.phase,
      error: this.error,
    }
  }

  installArchived(archivedSessionIds) {
    if (this.refreshFrames !== null) this.archivedSupersedesRefresh = true
    if (archivedSessionIds.length === this.archivedSessionIds.length
      && archivedSessionIds.every((id, index) => id === this.archivedSessionIds[index])) return
    this.archivedSessionIds = [...archivedSessionIds]
    this.notifier.markDirty()
  }

  installOrder(workspaceIds, committed = false) {
    if (committed) {
      this.refreshFrames?.push({ type: 'order', workspaceIds })
      this.committedOrder = [...workspaceIds]
    }
    const rank = new Map(workspaceIds.map((id, index) => [id, index]))
    const items = [...this.items].sort((left, right) => {
      const leftId = left.getSnapshot().view?.workspaceId
      const rightId = right.getSnapshot().view?.workspaceId
      return (leftId === undefined ? Number.MAX_SAFE_INTEGER : rank.get(leftId) ?? Number.MAX_SAFE_INTEGER)
        - (rightId === undefined ? Number.MAX_SAFE_INTEGER : rank.get(rightId) ?? Number.MAX_SAFE_INTEGER)
    })
    if (items.every((item, index) => item === this.items[index])) return
    this.items = items
    this.notifier.markDirty()
  }

  upsert(view, identity) {
    if (this.removedIds.has(view.workspaceId)) return
    this.refreshFrames?.push({ type: 'upsert', workspace: view })
    const index = this.items.findIndex(item => item.getSnapshot().view?.workspaceId === view.workspaceId)
    const installed = index === -1 ? undefined : this.items[index]?.getSnapshot().view
    if (installed !== undefined && Date.parse(view.updatedAt) < Date.parse(installed.updatedAt)) return
    if (!this.committedOrder.includes(view.workspaceId)) {
      this.committedOrder = [view.workspaceId, ...this.committedOrder]
    }
    if (identity !== undefined) {
      this.items = index === -1
        ? [identity, ...this.items]
        : this.items.map((item, position) => position === index ? identity : item)
    } else if (index === -1) {
      this.items = [new Workspace(this.api, view), ...this.items]
    } else {
      this.items[index]?.adopt(view)
      this.items = [...this.items]
    }
    this.notifier.markDirty()
  }

  remove(workspaceId, direct = false) {
    this.refreshFrames?.push({ type: 'remove', workspaceId })
    this.removedIds.add(workspaceId)
    this.committedOrder = this.committedOrder.filter(id => id !== workspaceId)
    const items = this.items.filter(item =>
      item.getSnapshot().view?.workspaceId !== workspaceId)
    if (items.length === this.items.length) {
      if (direct) this.notifier.notifyNow()
      return
    }
    this.items = items
    if (direct) this.notifier.notifyNow()
    else this.notifier.markDirty()
  }

  installViews(views) {
    const existing = new Map(
      this.items.flatMap((workspace) => {
        const view = workspace.getSnapshot().view
        return view === undefined ? [] : [[view.workspaceId, workspace]]
      }),
    )
    const installed = new Map()
    for (const view of views) {
      const duplicate = installed.get(view.workspaceId)
      if (duplicate !== undefined) {
        duplicate.adopt(view)
        continue
      }
      const workspace = existing.get(view.workspaceId) ?? new Workspace(this.api, view)
      workspace.adopt(view)
      installed.set(view.workspaceId, workspace)
    }
    this.items = [...installed.values()]
    this.committedOrder = views.map(view => view.workspaceId)
  }

  itemViews() {
    if (this.itemViewsSource === this.items) return this.itemViewsCache
    this.itemViewsSource = this.items
    this.itemViewsCache = this.items.flatMap((workspace) => {
      const view = workspace.getSnapshot().view
      return view === undefined ? [] : [view]
    })
    return this.itemViewsCache
  }
}

function upsertWorkspace(items, workspace) {
  const index = items.findIndex(item => item.workspaceId === workspace.workspaceId)
  return index === -1
    ? [workspace, ...items]
    : items.map((item, position) => position === index ? workspace : item)
}

function applyWorkspaceDelta(items, delta) {
  if (delta.type === 'upsert') return upsertWorkspace(items, delta.workspace)
  if (delta.type === 'remove') {
    return items.filter(workspace => workspace.workspaceId !== delta.workspaceId)
  }
  const rank = new Map(delta.workspaceIds.map((id, index) => [id, index]))
  return [...items].sort((left, right) =>
    (rank.get(left.workspaceId) ?? Number.MAX_SAFE_INTEGER)
    - (rank.get(right.workspaceId) ?? Number.MAX_SAFE_INTEGER))
}

function insertIdBefore(
  ids,
  id,
  beforeId,
) {
  if (!ids.includes(id) || (beforeId !== undefined && !ids.includes(beforeId)) || beforeId === id) {
    return [...ids]
  }
  const without = ids.filter(candidate => candidate !== id)
  const at = beforeId === undefined ? without.length : without.indexOf(beforeId)
  return [...without.slice(0, at), id, ...without.slice(at)]
}
