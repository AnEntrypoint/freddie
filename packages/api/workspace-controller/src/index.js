import { DirectoryPickerError } from '@freddie/freddie-host-directory-picker'
import { Remote, TypertRemoteService } from '@freddie/freddie-typert-protocol'
import {
  WorkspaceMoveInvalidError, WorkspaceOrderInvalidError, WorkspaceUnknownSessionError,
} from '@freddie/freddie-workspace'

function success(value) {
  return Object.freeze({ ok: true, value: Object.freeze(value) })
}

function rejected(code, message, details = {}) {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message, ...details }) })
}

function workspaceNotFound(workspaceId) {
  return rejected('workspace/not-found', 'no workspace carries this id', { workspaceId })
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function workspaceView(entity) {
  return {
    workspaceId: entity.id,
    path: entity.path,
    title: entity.title,
    sessionIds: [...entity.sessionIds],
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  }
}

export class WorkspaceController extends TypertRemoteService {
  static inject = ['workspaceRegistry']

  constructor(ctx) {
    super(ctx, 'workspaceController', { namespace: 'workspace' })
    ctx.plugin(DirectoryPickerController)
  }

  list() {
    return Promise.resolve(success({
      workspaces: this.ctx.workspaceRegistry.list().map(workspaceView),
      archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds],
    }))
  }

  async create(request) {
    const registry = this.ctx.workspaceRegistry
    try {
      const entity = await registry.create(request.path, request.title)
      return success({ workspace: workspaceView(entity) })
    } catch (error) {
      return rejected('workspace/invalid-path', messageOf(error), { path: request.path })
    }
  }

  async rename(request) {
    const entity = this.ctx.workspaceRegistry.get(request.workspaceId)
    if (entity === undefined) return workspaceNotFound(request.workspaceId)
    try {
      await entity.setTitle(request.title)
    } catch (error) {
      return rejected('workspace/rejected', messageOf(error), { workspaceId: request.workspaceId })
    }
    return success({ workspace: workspaceView(entity) })
  }

  async delete(request) {
    const registry = this.ctx.workspaceRegistry
    try {
      const deleted = await registry.delete(request.workspaceId)
      return success({ deleted })
    } catch (error) {
      return rejected('workspace/rejected', messageOf(error), { workspaceId: request.workspaceId })
    }
  }

  async insertBefore(request) {
    try {
      const workspaceIds = await this.ctx.workspaceRegistry.insertBefore(request.workspaceId, request.beforeId)
      return success({ workspaceIds: [...workspaceIds] })
    } catch (error) {
      if (error instanceof WorkspaceOrderInvalidError) {
        return rejected('workspace/not-found', messageOf(error), { workspaceId: error.workspaceId })
      }
      return rejected('workspace/rejected', messageOf(error), { workspaceId: request.workspaceId })
    }
  }

  async insertSessionBefore(request) {
    const entity = this.ctx.workspaceRegistry.get(request.workspaceId)
    if (entity === undefined) return workspaceNotFound(request.workspaceId)
    try {
      await entity.insertSessionBefore(request.sessionId, request.beforeSessionId)
    } catch (error) {
      if (error instanceof WorkspaceMoveInvalidError) {
        return rejected('workspace/move-invalid', messageOf(error), { workspaceId: request.workspaceId, sessionId: request.sessionId })
      }
      return rejected('workspace/rejected', messageOf(error), { workspaceId: request.workspaceId })
    }
    return success({ workspace: workspaceView(entity) })
  }

  async archiveSession(request) {
    try {
      await this.ctx.workspaceRegistry.archiveSession(request.sessionId)
    } catch (error) {
      if (error instanceof WorkspaceUnknownSessionError) {
        return rejected('session/not-found', messageOf(error), { sessionId: error.sessionId })
      }
      return rejected('workspace/rejected', messageOf(error), { sessionId: request.sessionId })
    }
    return success({ archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds] })
  }
}

export class DirectoryPickerController extends TypertRemoteService {
  static inject = ['directoryPicker']

  constructor(ctx) {
    super(ctx, 'directoryPickerController', { namespace: 'directoryPicker' })
  }

  async pick(signal) {
    const capability = this.requireCapability('native')
    if (typeof capability === 'string') {
      return rejected(capability, `directoryPicker.pick needs the native capability; the composed picker serves ${JSON.stringify(this.capabilityKind())}`, { capability: this.capabilityKind() })
    }
    try {
      return success({ path: await capability.pick(signal) })
    } catch (error) {
      return rejected('directory-picker/failed', messageOf(error), {})
    }
  }

  async list(request, signal) {
    const capability = this.requireCapability('browse')
    if (typeof capability === 'string') {
      return rejected(capability, `directoryPicker.list needs the browse capability; the composed picker serves ${JSON.stringify(this.capabilityKind())}`, { capability: this.capabilityKind() })
    }
    try {
      const listing = await capability.list(request.path, signal)
      return success({
        path: listing.path,
        home: listing.home,
        crumbs: listing.crumbs.map(crumb => ({ name: crumb.name, path: crumb.path, hidden: crumb.hidden })),
        entries: listing.entries.map(entry => ({ name: entry.name, path: entry.path, hidden: entry.hidden })),
        truncated: listing.truncated,
      })
    } catch (error) {
      return browseFailure(error)
    }
  }

  async createDirectory(request) {
    const capability = this.requireCapability('browse')
    if (typeof capability === 'string') {
      return rejected(capability, `directoryPicker.createDirectory needs the browse capability; the composed picker serves ${JSON.stringify(this.capabilityKind())}`, { capability: this.capabilityKind() })
    }
    try {
      return success({ path: await capability.createDirectory(request.path, request.name) })
    } catch (error) {
      return browseFailure(error)
    }
  }

  capabilityKind() {
    return this.ctx.directoryPicker.capability().kind
  }

  requireCapability(kind) {
    const capability = this.ctx.directoryPicker.capability()
    return capability.kind === kind ? capability : 'directory-picker/unavailable'
  }
}

const BROWSE_FAILURE_CODES = {
  'directory-unreadable': 'directory-picker/unreadable',
  'directory-exists': 'directory-picker/exists',
  'directory-create-failed': 'directory-picker/create-failed',
}

function browseFailure(error) {
  if (error instanceof DirectoryPickerError) {
    return rejected(BROWSE_FAILURE_CODES[error.code] ?? 'directory-picker/failed', error.message, { path: error.path })
  }
  return rejected('directory-picker/failed', messageOf(error), {})
}

const marker = (prototype, method) => ({
  name: method,
  private: false,
  static: false,
  addInitializer: fn => {
    fn.call(Object.create(prototype))
  },
})

Remote('list')(WorkspaceController.prototype.list, marker(WorkspaceController.prototype, 'list'))
Remote('create')(WorkspaceController.prototype.create, marker(WorkspaceController.prototype, 'create'))
Remote('rename')(WorkspaceController.prototype.rename, marker(WorkspaceController.prototype, 'rename'))
Remote('delete')(WorkspaceController.prototype.delete, marker(WorkspaceController.prototype, 'delete'))
Remote('insertBefore')(WorkspaceController.prototype.insertBefore, marker(WorkspaceController.prototype, 'insertBefore'))
Remote('insertSessionBefore')(WorkspaceController.prototype.insertSessionBefore, marker(WorkspaceController.prototype, 'insertSessionBefore'))
Remote('archiveSession')(WorkspaceController.prototype.archiveSession, marker(WorkspaceController.prototype, 'archiveSession'))
Remote('pick')(DirectoryPickerController.prototype.pick, marker(DirectoryPickerController.prototype, 'pick'))
Remote('list')(DirectoryPickerController.prototype.list, marker(DirectoryPickerController.prototype, 'list'))
Remote('createDirectory')(DirectoryPickerController.prototype.createDirectory, marker(DirectoryPickerController.prototype, 'createDirectory'))

export default WorkspaceController
