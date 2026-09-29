import { createHash } from 'node:crypto'
import { open, rename, rm } from 'node:fs/promises'
import { tooLarge } from './error.js'
import { SNIFF_BYTES, sniffMediaType } from './media-type.js'

function abortError(signal) {
  const reason = signal.reason
  if (reason instanceof Error) return reason
  return new DOMException('The upload intake was cancelled.', 'AbortError')
}

export async function stageUpload(staging, sessionId, chunks, options) {
  const { maxBytes, signal, onProgress } = options
  const dir = await staging.sessionDir(sessionId)
  if (dir === undefined) {
    throw new Error(`file-upload: session id "${String(sessionId)}" cannot name a staging directory`)
  }
  const temp = staging.tempPath(dir)
  const hash = createHash('sha256')
  let prefix = Buffer.alloc(0)
  let bytes = 0
  let overflow = false

  const handle = await open(temp, 'w')
  try {
    const iterator = chunks[Symbol.asyncIterator]()
    for (;;) {
      const step = await iterator.next()
      if (step.done === true) break
      const chunk = step.value
      if (signal?.aborted === true) throw abortError(signal)
      bytes += chunk.byteLength
      if (bytes > maxBytes) {
        overflow = true
        break
      }
      hash.update(chunk)
      if (prefix.byteLength < SNIFF_BYTES) {
        prefix = Buffer.concat([prefix, chunk.subarray(0, SNIFF_BYTES - prefix.byteLength)])
      }
      await handle.write(chunk)
      onProgress?.(bytes)
    }
  } catch (error) {
    await handle.close().catch(() => {})
    await rm(temp, { force: true })
    throw error
  }
  await handle.close()

  if (overflow) {
    await rm(temp, { force: true })
    throw tooLarge(maxBytes)
  }

  const digest = hash.digest('hex')
  const path = staging.digestPath(sessionId, digest)
  if (path === undefined) {
    await rm(temp, { force: true })
    throw new Error('file-upload: staged upload produced an unusable destination')
  }
  await rename(temp, path)
  return { bytes, digest, mediaType: sniffMediaType(prefix), path }
}
