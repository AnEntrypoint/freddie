/**
 * Host workspace Remote namespace owner plus the directory-picking controller
 * a workspace surface shares with it.
 *
 * freddie's Remote carrier serves unary methods only, so the whole ordered
 * workspace list arrives through `list` rather than through a live follow
 * stream: a Client that wants freshness re-reads after the
 * `domain/changed` event the registry already publishes.
 * @module @freddie/freddie-api-workspace-controller
 */

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

/** Project one durable workspace entity onto the wire. */
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

/** Host workspace Remote namespace owner. */
export class WorkspaceController extends TypertRemoteService {
  static inject = ['workspaceRegistry']

  /**
   * @param ctx - Host context carrying the durable workspace registry.
   */
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

  /**
   * @param request - directory to adopt as a workspace.
   */
  async create(request) {
    const registry = this.ctx.workspaceRegistry
    try {
      const entity = await registry.create(request.path, request.title)
      return success({ workspace: workspaceView(entity) })
    } catch (error) {
      return rejected('workspace/invalid-path', messageOf(error), { path: request.path })
    }
  }

  /**
   * @param request - workspace id and replacement display title.
   */
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

  /**
   * @param request - workspace registration to drop.
   */
  async delete(request) {
    const registry = this.ctx.workspaceRegistry
    try {
      const deleted = await registry.delete(request.workspaceId)
      return success({ deleted })
    } catch (error) {
      return rejected('workspace/rejected', messageOf(error), { workspaceId: request.workspaceId })
    }
  }

  /**
   * @param request - workspace to move and the anchor it lands before.
   */
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

  /**
   * @param request - session to move inside one workspace and its anchor.
   */
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

  /**
   * @param request - session to hide from every grouping surface.
   */
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

/**
 * Host directory-picking Remote namespace owner. The seam it exports is
 * abstract and therefore never a Loader entry of its own, so this controller
 * carries the wire verbs: one composed backend serves either the native
 * chooser or the browse primitives, and a verb the composition cannot serve is
 * refused rather than approximated.
 */
export class DirectoryPickerController extends TypertRemoteService {
  static inject = ['directoryPicker']

  /**
   * @param ctx - Host context carrying the composed directory-picking backend.
   */
  constructor(ctx) {
    super(ctx, 'directoryPickerController', { namespace: 'directoryPicker' })
  }

  /**
   * @param signal - caller lifetime; abort terminates the chooser.
   */
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

  /**
   * @param request - absolute directory to list; absent lists the home directory.
   * @param signal - caller lifetime; abort stops the backend's scan.
   */
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

  /**
   * @param request - existing parent directory and the child segment to create.
   */
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

  /** @returns the capability, or the wire code refusing a backend that cannot serve it. */
  requireCapability(kind) {
    const capability = this.ctx.directoryPicker.capability()
    return capability.kind === kind ? capability : 'directory-picker/unavailable'
  }
}

/** Wire code answered for each seam browse failure. */
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
