import { Service } from '@freddie/cordis'
import { bytesToBase64, randomUUID } from '@freddie/freddie-crypto'

function browserDraftAttachment(file) {
  return {
    kind: 'image',
    id: randomUUID(),
    previewUrl: URL.createObjectURL(file),
    file,
  }
}

export class UnsupportedImageMediaTypeError extends Error {
  constructor(mediaType) {
    super(`unsupported image media type: ${mediaType || '(empty)'}`)
    this.name = 'UnsupportedImageMediaTypeError'
    this.mediaType = mediaType
  }
}

export class ConversationController extends Service {
  constructor(ctx, config) {
    super(ctx, 'conversation')
    this.input = config.input
    this.blocks = config.blocks
    this.draftAttachments = new Map()
    this.imageUrls = new Map()
    this.imageGenerations = new Map()
    this.createdImageUrls = new Set()
    this.disposed = false
    ctx.effect(() => () => {
      this.disposed = true
      for (const url of this.createdImageUrls) revokePreview(url)
      this.createdImageUrls.clear()
      this.draftAttachments.clear()
      this.imageUrls.clear()
      this.imageGenerations.clear()
    }, 'conversation attachment URL cache')
  }

  async send(text) {
    const session = this.scopedSession('send')
    const result = await session.prompt([{ type: 'text', text }], 'queue')
    if (!result.ok) throw new Error(`conversation.send failed: ${result.error.code}: ${result.error.message}`)
  }

  async sendSession(session, text, imageIds, mode, signal) {
    const attachments = this.draftImages(imageIds)
    if (attachments.length !== imageIds.length) {
      throw new Error('conversation.sendSession: one or more draft images are no longer available')
    }
    const uploaded = await this.serializeImages(attachments.map(attachment => attachment.file))
    const content = [...uploaded, ...(text === '' ? [] : [{ type: 'text', text }])]
    const result = await session.prompt(content, mode, signal)
    if (!result.ok) return { kind: 'error' }
    this.releaseDraftImages(attachments)
    return { kind: 'success' }
  }

  createDraftImages(files) {
    for (const file of files) imageMediaType(file.type)
    return files.map((file) => {
      const attachment = browserDraftAttachment(file)
      this.draftAttachments.set(attachment.id, attachment)
      this.createdImageUrls.add(attachment.previewUrl)
      return attachment
    })
  }

  draftImages(ids) {
    const attachments = []
    for (const id of ids) {
      const attachment = this.draftAttachments.get(id)
      if (attachment !== undefined) attachments.push(attachment)
    }
    return attachments
  }

  async serializeDraftImages(imageIds) {
    const attachments = this.draftImages(imageIds)
    if (attachments.length !== imageIds.length) {
      throw new Error('conversation.serializeDraftImages: one or more draft images are no longer available')
    }
    return Promise.all(attachments.map(attachment => this.encodeImage(attachment.file)))
  }

  releaseDraftImage(id) {
    const attachment = this.draftAttachments.get(id)
    if (attachment === undefined) return
    this.draftAttachments.delete(id)
    this.createdImageUrls.delete(attachment.previewUrl)
    revokePreview(attachment.previewUrl)
  }

  releaseDraftImages(attachments) {
    for (const attachment of attachments) this.releaseDraftImage(attachment.id)
  }

  resolveImage(sessionId, attachment) {
    if (this.disposed) return Promise.reject(new Error('conversation.resolveImage: service is disposed'))
    const key = `${sessionId}:${attachment.attachmentId}`
    const cached = this.imageUrls.get(key)
    if (cached !== undefined) return cached.pending
    const generation = this.imageGenerations.get(sessionId) ?? 0
    const session = this.requireSessions().binding(sessionId)?.session
    if (session === undefined) {
      return Promise.reject(new Error(`conversation.resolveImage: unknown session "${sessionId}"`))
    }
    const pending = session.readAttachment(attachment.attachmentId)
      .then((result) => {
        if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
        if (this.disposed) throw new Error('conversation.resolveImage: service was disposed before loading completed')
        if ((this.imageGenerations.get(sessionId) ?? 0) !== generation) {
          throw new Error('historical image scope was released before loading completed')
        }
        if (typeof URL.createObjectURL !== 'function') {
          return `data:${result.value.attachment.mediaType};base64,${bytesToBase64(result.value.data)}`
        }
        const bytes = Uint8Array.from(result.value.data)
        const url = URL.createObjectURL(new Blob([bytes.buffer], { type: result.value.attachment.mediaType }))
        this.createdImageUrls.add(url)
        return url
      })
      .catch((error) => {
        if (this.imageUrls.get(key)?.generation === generation) this.imageUrls.delete(key)
        throw error
      })
    this.imageUrls.set(key, { sessionId, generation, pending })
    return pending
  }

  releaseSessionImages(sessionId) {
    this.imageGenerations.set(sessionId, (this.imageGenerations.get(sessionId) ?? 0) + 1)
    for (const [key, entry] of this.imageUrls) {
      if (entry.sessionId !== sessionId) continue
      this.imageUrls.delete(key)
      void entry.pending.then((url) => {
        if (!this.createdImageUrls.delete(url)) return
        revokePreview(url)
      }, () => {
      })
    }
  }

  async updateQueue(itemId, action) {
    const session = this.scopedSession('updateQueue')
    const result = await session.updateQueue(itemId, action)
    if (!result.ok) {
      if (
        action.kind === 'steer'
        && (result.error.code === 'steer-unavailable' || result.error.code === 'queue-item-not-found')
      ) return
      throw new Error(`conversation.updateQueue failed: ${result.error.code}: ${result.error.message}`)
    }
  }

  async cancel() {
    const session = this.scopedSession('cancel')
    const result = await session.cancel()
    if (!result.ok) throw new Error(`conversation.cancel failed: ${result.error.code}: ${result.error.message}`)
  }

  async loadOlder() {
    await this.scopedSession('loadOlder').loadOlder()
  }

  scopedSession(op) {
    const id = this.scopeId(op)
    const binding = this.requireSessions().binding(id)
    if (binding === undefined) throw new Error(`conversation.${op}: session "${id}" resolved no binding`)
    return binding.session
  }

  scopeId(op) {
    const id = this.requireSessions().scopeOf(this.ctx)
    if (id === undefined) {
      throw new Error(`conversation.${op} requires a session scope — address one via ctx.sessions.scope(id).conversation`)
    }
    return id
  }

  requireSessions() {
    const sessions = this.ctx.get('sessions')
    if (sessions === undefined) throw new Error('conversation: sessions service unavailable')
    return sessions
  }

  serializeImages(images) {
    return Promise.all(images.map(async file => ({ type: 'image', ...await this.encodeImage(file) })))
  }

  async encodeImage(file) {
    return {
      mediaType: imageMediaType(file.type),
      data: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
      ...(file.name === '' ? {} : { name: file.name }),
    }
  }
}

function imageMediaType(value) {
  switch (value) {
    case 'image/png':
    case 'image/jpeg':
    case 'image/webp':
    case 'image/gif':
      return value
    default:
      throw new UnsupportedImageMediaTypeError(value)
  }
}

function revokePreview(url) {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url)
}
