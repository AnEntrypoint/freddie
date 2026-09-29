import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Service } from '@freddie/cordis'
import { resolveFreddieHome } from '@freddie/freddie-home-paths'
import z from '@freddie/schemastery'
import {
  fileNotStaged, notAnImage, sessionNotAttached, UploadError,
} from './error.js'
import { handleFileUploadHttp } from './http-route.js'
import { stageUpload } from './intake.js'
import { isPromptImage } from './media-type.js'
import { UploadStaging } from './staging.js'
import { displayName, FILE_UPLOAD_PATH, PROMPT_IMAGE_MEDIA_TYPES } from './shared.js'

export { UploadError } from './error.js'
export { FILE_UPLOAD_PATH, FILE_UPLOAD_ROUTE } from './shared.js'
export { UploadStaging } from './staging.js'

export const DEFAULT_MAX_UPLOAD_BYTES = 64 * 1024 * 1024

export const STAGING_SUBPATH = join('uploads', 'v1')

export const name = 'client-file-upload'

export const inject = ['webServer']

export const Config = z.object({
  freddieHome: z.string(),
  maxUploadBytes: z.number().step(1).min(1).max(2 * 1024 * 1024 * 1024).default(DEFAULT_MAX_UPLOAD_BYTES),
})

class PromptFileBindingGuard {
  constructor(bound) {
    this.bound = bound
    this.settled = false
  }

  commit() {
    this.settled = true
  }

  dispose() {
    if (this.settled) return
    this.settled = true
    for (const { entry, previous } of this.bound) {
      if (previous === undefined) delete entry.requestId
      else entry.requestId = previous
    }
  }

  [Symbol.dispose]() {
    this.dispose()
  }
}

export class FileUploads extends Service {
  static inject = inject

  static Config = Config

  constructor(ctx, config) {
    super(ctx, 'fileUploads')
    this.root = resolve(join(resolveFreddieHome(config?.freddieHome), STAGING_SUBPATH))
    this.maxUploadBytes = config?.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES
    this.staging = new UploadStaging(this.root)
    this.staged = new Map()

    ctx.effect(
      () => ctx.webServer.register({
        kind: 'exact',
        path: FILE_UPLOAD_PATH,
        handler: (req, res) => {
          void handleFileUploadHttp(this, req, res)
        },
      }),
      `client-file-upload: POST ${FILE_UPLOAD_PATH}`,
    )
    ctx.on('session/disposed', (session) => {
      const id = session?.id
      if (typeof id === 'string') this.dropSession(id)
    })
  }

  async uploadStream(request) {
    const sessionId = request.sessionId
    this.requireSession(sessionId)
    const staged = await stageUpload(this.staging, sessionId, request.data, {
      maxBytes: this.maxUploadBytes,
      signal: request.signal,
      onProgress: request.onProgress,
    })
    if (this.authorize(sessionId) === undefined) {
      await this.staging.remove(staged.path)
      throw sessionNotAttached(sessionId)
    }
    const receiptId = randomUUID()
    const entry = {
      sessionId,
      receiptId,
      bytes: staged.bytes,
      digest: staged.digest,
      mediaType: staged.mediaType ?? 'application/octet-stream',
      path: staged.path,
      ...(request.name === undefined ? {} : { name: displayName(request.name) }),
      requestId: undefined,
    }
    let table = this.staged.get(sessionId)
    if (table === undefined) {
      table = new Map()
      this.staged.set(sessionId, table)
    }
    table.set(receiptId, entry)
    return {
      receiptId,
      file: {
        bytes: entry.bytes,
        mediaType: entry.mediaType,
        sha256: entry.digest,
        ...(entry.name === undefined ? {} : { name: entry.name }),
      },
    }
  }

  entry(sessionId, receiptId) {
    if (typeof receiptId !== 'string') return undefined
    return this.staged.get(sessionId)?.get(receiptId)
  }

  resolve(sessionId, receiptId) {
    const entry = this.entry(sessionId, receiptId)
    if (entry === undefined) return undefined
    return Object.freeze({
      receiptId: entry.receiptId,
      bytes: entry.bytes,
      mediaType: entry.mediaType,
      sha256: entry.digest,
      ...(entry.name === undefined ? {} : { name: entry.name }),
    })
  }

  async readBytes(sessionId, receiptId, signal) {
    const entry = this.entry(sessionId, receiptId)
    if (entry === undefined) throw fileNotStaged()
    signal?.throwIfAborted()
    const bytes = await readFile(entry.path)
    signal?.throwIfAborted()
    if (bytes.byteLength !== entry.bytes) {
      throw new UploadError('upload/internal', 'staged upload no longer matches its recorded size', 500)
    }
    if (createHash('sha256').update(bytes).digest('hex') !== entry.digest) {
      throw new UploadError('upload/internal', 'staged upload no longer matches its recorded digest', 500)
    }
    return new Uint8Array(bytes)
  }

  bindPrompt(sessionId, receiptIds, requestId) {
    const table = this.staged.get(sessionId)
    const bound = receiptIds.map((receiptId) => {
      const entry = table?.get(receiptId)
      if (entry === undefined) throw fileNotStaged()
      return { entry, previous: entry.requestId }
    })
    for (const { entry } of bound) entry.requestId = requestId
    return new PromptFileBindingGuard(bound)
  }

  retirePrompt(sessionId, requestId) {
    const table = this.staged.get(sessionId)
    if (table === undefined) return
    for (const [receiptId, entry] of table) {
      if (entry.requestId === requestId) table.delete(receiptId)
    }
    if (table.size === 0) this.staged.delete(sessionId)
  }

  async admitPromptReceipts(sessionId, receiptIds) {
    const out = []
    for (const receiptId of receiptIds) {
      const entry = this.entry(sessionId, receiptId)
      if (entry === undefined) throw fileNotStaged()
      if (!isPromptImage(entry.mediaType) || !PROMPT_IMAGE_MEDIA_TYPES.includes(entry.mediaType)) {
        throw notAnImage(entry.mediaType)
      }
      const bytes = await this.readBytes(sessionId, receiptId)
      out.push({
        mediaType: entry.mediaType,
        data: Buffer.from(bytes).toString('base64'),
        ...(entry.name === undefined ? {} : { name: entry.name }),
      })
    }
    return out
  }

  authorize(sessionId) {
    const sessions = this.ctx.get('sessions')
    if (sessions === undefined || typeof sessions.get !== 'function') return undefined
    let session
    try {
      session = sessions.get(sessionId)
    } catch {
      return undefined
    }
    if (session === undefined || session === null || typeof session !== 'object') return undefined
    const isSubagentConversation = session.header?.origin === 'subagent'
    if (isSubagentConversation) return undefined
    return session
  }

  requireSession(sessionId) {
    if (this.authorize(sessionId) === undefined) throw sessionNotAttached(sessionId)
  }

  dropSession(sessionId) {
    this.staged.delete(sessionId)
  }
}

export function apply(ctx, config) {
  new FileUploads(ctx, config)
}

export default FileUploads
