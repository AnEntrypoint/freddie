/**
 * Host half: the authenticated streaming upload route, the staged-upload tree,
 * and the session-scoped receipt lifecycle.
 *
 * A receipt is authority to reuse bytes this session already sent, not a path
 * and not a promise about a file the caller named. It is minted only after the
 * bytes are committed, it resolves only under the session id that uploaded
 * them, and it is retired when the prompt that consumed it is observed.
 * @module @freddie/freddie-client-file-upload
 */

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

/** Default per-upload ceiling: 64 MiB, comfortably above one normalized image and far below RAM. */
export const DEFAULT_MAX_UPLOAD_BYTES = 64 * 1024 * 1024

/** Staged-upload tree below the harness home. */
export const STAGING_SUBPATH = join('uploads', 'v1')

/** Cordis plugin name. */
export const name = 'client-file-upload'

/** The route carrier; the trust fence is imported, not injected, because it is a pure request predicate. */
export const inject = ['webServer']

/** Host upload configuration. */
export const Config = z.object({
  /** Harness home holding the staged-upload tree; defaults to {@link resolveFreddieHome}. */
  freddieHome: z.string(),
  /** Hard per-upload byte ceiling; the intake stops and discards past it. */
  maxUploadBytes: z.number().step(1).min(1).max(2 * 1024 * 1024 * 1024).default(DEFAULT_MAX_UPLOAD_BYTES),
})

/**
 * Prompt receipt binding that restores its previous owners unless delivery
 * commits it.
 * @typedef {object} PromptFileBinding
 * @property {() => void} commit - keep the bindings until a prompt observation retires them.
 * @property {() => void} dispose - restore every previous binding.
 */

/** One receipt bound into one prompt; disposal restores what it replaced. */
class PromptFileBindingGuard {
  /** @param bound - receipt entries and the request ids they held before. */
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

/**
 * Host storage and staged-receipt service for browser file uploads.
 */
export class FileUploads extends Service {
  static inject = inject

  static Config = Config

  /** @param ctx - host context carrying the web server. */
  constructor(ctx, config) {
    super(ctx, 'fileUploads')
    this.root = resolve(join(resolveFreddieHome(config?.freddieHome), STAGING_SUBPATH))
    this.maxUploadBytes = config?.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES
    this.staging = new UploadStaging(this.root)
    /** @type {Map<string, Map<string, object>>} */
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

  /**
   * Persist raw chunks for one session without aggregating the upload.
   *
   * The session is authorized twice: once before intake starts, and again
   * after it finishes, because the intake can outlive the session it was
   * addressed to. A session that disappears mid-upload loses its staged bytes.
   *
   * @param request - session identity, ordered bytes, cancellation, and optional display name.
   * @returns the staged receipt and the durable file description.
   */
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

  /**
   * Look up one staged entry inside the session that uploaded it.
   * @param sessionId - session that owns the receipt.
   * @param receiptId - opaque receipt minted for one completed upload.
   * @returns the mutable entry, or undefined for an unknown or foreign receipt.
   */
  entry(sessionId, receiptId) {
    if (typeof receiptId !== 'string') return undefined
    return this.staged.get(sessionId)?.get(receiptId)
  }

  /**
   * Resolve one staged receipt inside the session that uploaded it.
   * @param sessionId - session that owns the receipt.
   * @param receiptId - opaque receipt minted for one completed upload.
   * @returns an immutable description, or undefined for an unknown or foreign receipt.
   */
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

  /**
   * Read one staged upload back and verify it still matches its own digest.
   * @param sessionId - session that owns the receipt.
   * @param receiptId - opaque receipt minted for one completed upload.
   * @param signal - optional cancellation.
   * @returns the exact staged bytes.
   */
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

  /**
   * Bind receipts while one prompt enters a session inbox.
   * Disposal restores every prior binding unless the caller commits successful
   * delivery, so a prompt that fails admission leaves no receipt claimed.
   * @param sessionId - session that owns the receipts.
   * @param receiptIds - distinct staged receipts referenced by the prompt.
   * @param requestId - prompt identity later observed in queue or history.
   * @returns binding kept after commit until a prompt observation retires it.
   * @throws UploadError when any receipt is not staged for this session.
   */
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

  /**
   * Retire every receipt accepted by one removed queue occurrence.
   * @param sessionId - session that owns the receipts.
   * @param requestId - prompt identity carried by the queue occurrence.
   */
  retirePrompt(sessionId, requestId) {
    const table = this.staged.get(sessionId)
    if (table === undefined) return
    for (const [receiptId, entry] of table) {
      if (entry.requestId === requestId) table.delete(receiptId)
    }
    if (table.size === 0) this.staged.delete(sessionId)
  }

  /**
   * Turn staged receipts back into the wire form freddie's prompt admission
   * already accepts, so a later prompt reuses bytes rather than re-sending
   * them.
   *
   * This is the seam prompt admission calls: the returned objects are exactly
   * `EncodedImageAttachment` rows, the shape `admitEncodedImages` consumes.
   * A staged upload whose sniffed type is not an accepted image is refused,
   * because freddie's prompt content is image-only today.
   *
   * @param sessionId - session that owns the receipts.
   * @param receiptIds - staged receipts referenced by the prompt, in prompt order.
   * @returns encoded attachments in the same order as `receiptIds`.
   * @throws UploadError for an unstaged receipt or a non-image staged file.
   */
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

  /**
   * Authorize one upload target. Fails safe: a composition with no session
   * store, an unknown session id, or a subagent session is all refusal.
   * @param sessionId - session the upload is addressed to.
   * @returns the live session object, or undefined when the upload must be refused.
   */
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

  /** Throw the refusal for an unauthorized session. */
  requireSession(sessionId) {
    if (this.authorize(sessionId) === undefined) throw sessionNotAttached(sessionId)
  }

  /** Drop every receipt one disposed session held. */
  dropSession(sessionId) {
    this.staged.delete(sessionId)
  }
}

/**
 * Mount the host half.
 * @param ctx - host plugin context.
 * @param config - resolved plugin config (schema defaults applied).
 */
export function apply(ctx, config) {
  new FileUploads(ctx, config)
}

export default FileUploads
