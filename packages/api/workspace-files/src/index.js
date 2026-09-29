/**
 * Bounded workspace file Remote reads over the filesystem and sandbox seams.
 *
 * Every verb resolves its target through `ctx.fs` and then proves containment
 * in a workspace root, so a path that escapes through `..` or a symlink is
 * refused rather than read. Reads go through `readBytes` — the one primitive
 * whose byte cap the backend enforces — so an oversized file is rejected at
 * the seam instead of being decoded whole into this process.
 *
 * When no session cwd and no sandbox fallback root can be established the
 * request is refused: a read with no boundary is never served.
 * @module @freddie/freddie-api-workspace-files
 */

import { Buffer } from 'node:buffer'
import z from '@freddie/schemastery'
import { FsError } from '@freddie/freddie-fs'
import { Remote, TypertRemoteService } from '@freddie/freddie-typert-protocol'

const MEBIBYTE = 1024 * 1024
const UTF8 = new TextDecoder('utf-8', { fatal: true })

/** Wire code answered for each filesystem seam failure. */
const FAILURE_CODES = {
  FS_NOT_FOUND: 'workspace-file/not-found',
  FS_NOT_TEXT: 'workspace-file/not-text',
  FS_NOT_REGULAR_FILE: 'workspace-file/not-regular-file',
  FS_TOO_LARGE: 'workspace-file/too-large',
  FS_ABORTED: 'workspace-file/aborted',
}

function success(value) {
  return Object.freeze({ ok: true, value: Object.freeze(value) })
}

function rejected(code, message, details = {}) {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message, ...details }) })
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function fsFailure(error, path, limit) {
  const code = error instanceof FsError ? error.code : undefined
  const wire = code === undefined ? undefined : FAILURE_CODES[code]
  return rejected(
    wire ?? 'workspace-file/unreadable',
    messageOf(error),
    { path, ...limit === undefined ? {} : { limit } },
  )
}

function notFound(path) {
  return rejected('workspace-file/not-found', 'no entry exists at this workspace path', { path })
}

/** Workspace file read owner for one composition. */
export class WorkspaceFiles extends TypertRemoteService {
  static inject = ['fs']

  static Config = z.object({
    maxBytes: z.number().step(1).min(1).default(2 * MEBIBYTE),
    maxFileBytes: z.number().step(1).min(1).default(32 * MEBIBYTE),
    maxLines: z.number().step(1).min(1).default(5000),
    maxEntries: z.number().step(1).min(1).default(2000),
  })

  /**
   * @param ctx - Host context carrying the filesystem backend.
   * @param config - byte and line bounds every read is cut to.
   */
  constructor(ctx, config = {}) {
    super(ctx, 'workspaceFiles')
    this.config = config
  }

  /**
   * @param request - workspace path and optional owning session.
   */
  async stat(request) {
    const located = await this.locate(request)
    if (located.failure !== undefined) return located.failure
    try {
      const info = await this.ctx.fs.stat(located.target)
      if (info === undefined) return notFound(request.path)
      return success(this.statView(located, info))
    } catch (error) {
      return fsFailure(error, request.path, this.config.maxFileBytes)
    }
  }

  /**
   * @param request - workspace path, owning session, and the line window.
   */
  async read(request) {
    const located = await this.locate(request)
    if (located.failure !== undefined) return located.failure
    let info
    let bytes
    try {
      info = await this.ctx.fs.stat(located.target)
      if (info === undefined) return notFound(request.path)
      bytes = await this.ctx.fs.readBytes(located.target, undefined, this.config.maxFileBytes)
    } catch (error) {
      return fsFailure(error, request.path, this.config.maxFileBytes)
    }
    let text
    try {
      text = decodeText(bytes)
    } catch (error) {
      return fsFailure(error, request.path)
    }
    const lines = text.split('\n')
    const first = Math.max(1, Math.trunc(request.offset ?? 1))
    const span = Math.min(this.config.maxLines, Math.trunc(request.limit ?? this.config.maxLines))
    const page = lines.slice(first - 1, first - 1 + span)
    return success({
      ...this.statView(located, info),
      offset: first,
      text: page.join('\n'),
      lines: page.length,
      eof: first - 1 + page.length >= lines.length,
    })
  }

  /**
   * @param request - workspace path, owning session, and the byte window.
   */
  async readBytes(request) {
    const located = await this.locate(request)
    if (located.failure !== undefined) return located.failure
    let info
    let bytes
    try {
      info = await this.ctx.fs.stat(located.target)
      if (info === undefined) return notFound(request.path)
      bytes = await this.ctx.fs.readBytes(located.target, undefined, this.config.maxFileBytes)
    } catch (error) {
      return fsFailure(error, request.path, this.config.maxFileBytes)
    }
    const first = Math.max(0, Math.trunc(request.offset ?? 0))
    const span = Math.min(this.config.maxBytes, Math.trunc(request.length ?? this.config.maxBytes))
    const window = Buffer.from(bytes.subarray(first, first + span))
    return success({
      ...this.statView(located, info),
      offset: first,
      encoding: 'base64',
      data: window.toString('base64'),
      eof: first + window.byteLength >= bytes.byteLength,
    })
  }

  /**
   * @param request - workspace directory to list and optional owning session.
   */
  async list(request) {
    const path = request.path ?? ''
    const located = await this.locate({ ...request, path: path === '' ? '.' : path })
    if (located.failure !== undefined) return located.failure
    let info
    let entries
    try {
      info = await this.ctx.fs.stat(located.target)
      if (info === undefined) return notFound(path)
      if (info.type !== 'directory') {
        return rejected('workspace-file/not-directory', 'this workspace path is not a directory', { path, kind: info.type })
      }
      entries = await this.ctx.fs.listDir(located.target)
    } catch (error) {
      return fsFailure(error, path, this.config.maxEntries)
    }
    const kept = entries.slice(0, this.config.maxEntries)
    return success({
      path,
      entries: kept.map(entry => ({
        name: entry.name,
        type: entry.type,
        ...entry.size === undefined ? {} : { size: entry.size },
      })),
      truncated: entries.length > kept.length,
    })
  }

  statView(located, info) {
    return {
      absolutePath: this.ctx.fs.processPath(located.target),
      version: info.version,
      ...info.size === undefined ? {} : { bytes: info.size },
    }
  }

  /** @returns the confined target, or the failure refusing this request. */
  async locate(request) {
    const root = await this.rootFor(request.sessionId)
    if (root === undefined) {
      return { failure: rejected('workspace-file/root-unavailable', 'no workspace root bounds this request', { path: request.path }) }
    }
    try {
      const rootTarget = await this.ctx.fs.resolve(root)
      const target = await this.ctx.fs.resolve(request.path, { cwd: root })
      if (!this.ctx.fs.contains(rootTarget, target)) {
        return { failure: rejected('workspace-file/outside-workspace', 'this path resolves outside the workspace root', { path: request.path }) }
      }
      return { target }
    } catch (error) {
      return { failure: fsFailure(error, request.path) }
    }
  }

  /** The session's immutable cwd, else the deployment's sandbox fallback root. */
  async rootFor(sessionId) {
    if (sessionId !== undefined) {
      const cwd = this.ctx.get('sessions')?.get(sessionId)?.header?.cwd
      if (typeof cwd === 'string' && cwd !== '') return cwd
    }
    const root = this.ctx.get('sandboxPolicy')?.workspaceRoot
    return typeof root === 'string' && root !== '' ? root : undefined
  }
}

/** Decode one byte window as UTF-8 text, refusing binary content. */
function decodeText(bytes) {
  if (bytes.includes(0)) {
    throw new FsError('cannot read file: binary content', 'FS_NOT_TEXT')
  }
  try {
    return UTF8.decode(bytes)
  } catch (cause) {
    throw new FsError('cannot read file: invalid UTF-8 text', 'FS_NOT_TEXT', { cause })
  }
}

const marker = (prototype, method) => ({
  name: method,
  private: false,
  static: false,
  addInitializer: fn => {
    fn.call(Object.create(prototype))
  },
})

Remote('stat')(WorkspaceFiles.prototype.stat, marker(WorkspaceFiles.prototype, 'stat'))
Remote('read')(WorkspaceFiles.prototype.read, marker(WorkspaceFiles.prototype, 'read'))
Remote('readBytes')(WorkspaceFiles.prototype.readBytes, marker(WorkspaceFiles.prototype, 'readBytes'))
Remote('list')(WorkspaceFiles.prototype.list, marker(WorkspaceFiles.prototype, 'list'))

export default WorkspaceFiles
