import { Zip, ZipDeflate } from 'fflate'

export const DEFAULT_SESSION_LOG_COMPRESSION_LEVEL = 6

export function sessionLogExportDeps(ctx) {
  return {
    sessionQuery: ctx.get('sessionQuery'),
    sessionPersistence: ctx.get('sessionPersistence'),
    attachments: ctx.get('attachments'),
    sessions: ctx.get('sessions'),
  }
}

export async function flushLiveSessionLog(deps, id, signal) {
  signal?.throwIfAborted()
  const sessions = deps.sessions
  if (sessions === undefined) return
  const session = sessions.get(id)
  if (session === undefined) return
  await sessions.flush(session)
  signal?.throwIfAborted()
}

const MEDIA_TYPE_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function mediaEntryPath(ref) {
  return `media/${String(ref.attachmentId)}.${MEDIA_TYPE_EXTENSIONS[ref.mediaType]}`
}

function collectImageRefs(content, refs) {
  if (!Array.isArray(content)) return
  const pending = []
  for (const item of content) pending.push(item)
  while (pending.length > 0) {
    const value = pending.pop()
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const block = value
    if (block.type === 'image' && typeof block.attachment === 'object' && block.attachment !== null) {
      const ref = block.attachment
      refs.set(String(ref.attachmentId), ref)
    }
    if (Array.isArray(block.content)) {
      for (const item of block.content) pending.push(item)
    }
  }
}

function collectEventImageRefs(event, refs) {
  const data = event.data
  if (typeof data !== 'object' || data === null) return
  const carrier = data
  collectImageRefs(carrier.content, refs)
  if (carrier.message !== undefined) collectImageRefs(carrier.message.content, refs)
  if (carrier.inserted !== undefined) {
    for (const message of carrier.inserted) collectImageRefs(message.content, refs)
  }
  if (carrier.chunk?.type === 'block-end') collectImageRefs([carrier.chunk.block], refs)
}

function imageRefsInArtifact(content) {
  const refs = new Map()
  for (const line of content.split('\n')) {
    if (line === '') continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    collectEventImageRefs(event, refs)
  }
  return refs
}

function safeSessionIdSegment(id) {
  return id.replace(/[^A-Za-z0-9_-]/g, '_')
}

export function sessionLogZipFilename(sessionId) {
  return `freddie-session-${safeSessionIdSegment(sessionId)}.zip`
}

export async function* sessionLogZipEntries(deps, root, sessionId, includeDescendants, signal) {
  const media = new Map()
  const rememberMedia = (content) => {
    for (const [id, ref] of imageRefsInArtifact(content)) media.set(id, ref)
  }
  rememberMedia(root.content)
  yield { path: root.filename, content: root.content }
  if (includeDescendants) {
    const seen = new Set([sessionId])
    const collect = async function* (nodes) {
      for (const node of nodes) {
        signal?.throwIfAborted()
        const id = node.session.header.id
        if (seen.has(id)) continue
        seen.add(id)
        await flushLiveSessionLog(deps, id, signal)
        const raw = await deps.sessionPersistence.readRaw(id, signal)
        signal?.throwIfAborted()
        if (raw === undefined) {
          throw new Error(`subagent "${id}" has no stored log artifact`)
        }
        rememberMedia(raw.content)
        yield {
          path: `subagents/${safeSessionIdSegment(id)}/${raw.filename}`,
          content: raw.content,
        }
        yield* collect(node.descendants)
      }
    }
    const lineage = await deps.sessionQuery.traceSession(sessionId, signal)
    signal?.throwIfAborted()
    yield* collect(lineage.descendants)
  }
  for (const ref of media.values()) {
    signal?.throwIfAborted()
    const stored = await deps.attachments.readImage(ref, signal)
    signal?.throwIfAborted()
    yield { path: mediaEntryPath(ref), data: stored.data }
  }
}

const PUSH_CHUNK_CODE_UNITS = 1 << 16

const PUSH_CHUNK_BYTES = 1 << 16

const RESPONSE_HIGH_WATER_MARK_BYTES = 1 << 16

class ResponseCapacityGate {
  releasePending

  async wait(controller, signal) {
    signal.throwIfAborted()
    if (controller.desiredSize === null || controller.desiredSize > 0) return
    await new Promise((resolve) => {
      const release = () => {
        this.releasePending = undefined
        signal.removeEventListener('abort', release)
        resolve()
      }
      this.releasePending = release
      signal.addEventListener('abort', release, { once: true })
    })
    signal.throwIfAborted()
  }

  pulled() {
    this.releasePending?.()
  }
}

async function pushBinaryChunks(deflate, data, controller, capacity, signal) {
  let offset = 0
  do {
    signal.throwIfAborted()
    const end = Math.min(offset + PUSH_CHUNK_BYTES, data.byteLength)
    const finalChunk = end >= data.byteLength
    deflate.push(data.subarray(offset, end), finalChunk)
    offset = end
    await capacity.wait(controller, signal)
  } while (offset < data.byteLength)
}

async function pushArtifactChunks(deflate, content, controller, capacity, signal) {
  const encoder = new TextEncoder()
  let offset = 0
  let finalChunk
  do {
    signal.throwIfAborted()
    let end = Math.min(offset + PUSH_CHUNK_CODE_UNITS, content.length)
    if (end < content.length && end - offset > 1) {
      const last = content.charCodeAt(end - 1)
      if (last >= 0xd800 && last <= 0xdbff) end -= 1
    }
    finalChunk = end >= content.length
    deflate.push(encoder.encode(content.slice(offset, end)), finalChunk)
    offset = end
    await capacity.wait(controller, signal)
  } while (!finalChunk)
}

export function streamSessionLogZip(deps, root, sessionId, includeDescendants, compressionLevel, signal) {
  const consumerAbort = new AbortController()
  const producerSignal = AbortSignal.any([signal, consumerAbort.signal])
  let zip
  let zipTerminated = false
  const capacity = new ResponseCapacityGate()
  const terminateZip = () => {
    if (zip === undefined || zipTerminated) return
    zipTerminated = true
    zip.terminate()
  }
  return new ReadableStream({
    start(controller) {
      const archive = new Zip((error, data, final) => {
        if (error) {
          controller.error(error)
          return
        }
        if (data.byteLength > 0) controller.enqueue(data)
        if (final) controller.close()
      })
      zip = archive
      void (async () => {
        try {
          for await (const entry of sessionLogZipEntries(deps, root, sessionId, includeDescendants, producerSignal)) {
            const deflate = new ZipDeflate(entry.path, { level: compressionLevel })
            archive.add(deflate)
            if ('content' in entry) {
              await pushArtifactChunks(deflate, entry.content, controller, capacity, producerSignal)
            } else {
              await pushBinaryChunks(deflate, entry.data, controller, capacity, producerSignal)
            }
          }
          archive.end()
        } catch (error) {
          terminateZip()
          controller.error(error instanceof Error ? error : new Error(String(error)))
        }
      })()
    },
    pull() {
      capacity.pulled()
    },
    cancel(reason) {
      consumerAbort.abort(
        reason instanceof Error ? reason : new Error('session log export stream cancelled'),
      )
      terminateZip()
    },
  }, {
    highWaterMark: RESPONSE_HIGH_WATER_MARK_BYTES,
    size: chunk => chunk.byteLength,
  })
}
