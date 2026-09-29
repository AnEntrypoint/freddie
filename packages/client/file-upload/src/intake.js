/**
 * Streamed intake: bytes go to disk as they arrive, are hashed on the way
 * through, and are counted against one ceiling.
 *
 * No upload is ever aggregated in memory — the largest thing this module holds
 * is one socket chunk plus {@link SNIFF_BYTES} of prefix. That is the whole
 * point of the transport: the `/api` RPC bridge buffers whole bodies (300 MiB
 * by default) and the browser composer base64-inlines attachments into the
 * prompt payload today, so neither can carry a real file.
 * @module @freddie/freddie-client-file-upload/intake
 */

import { createHash } from 'node:crypto'
import { open, rename, rm } from 'node:fs/promises'
import { tooLarge } from './error.js'
import { SNIFF_BYTES, sniffMediaType } from './media-type.js'

/** Turn one cancellation into a thrown value carrying the signal's own reason. */
function abortError(signal) {
  const reason = signal.reason
  if (reason instanceof Error) return reason
  return new DOMException('The upload intake was cancelled.', 'AbortError')
}

/**
 * Consume one upload body and commit it under its own digest.
 *
 * The intake stops on the first chunk past `maxBytes`, on an aborted signal,
 * or on a read error; in all three cases the partial file is removed and
 * nothing is committed, so a cancelled or oversized upload leaves no staged
 * object and no receipt behind.
 *
 * @param staging - host-owned staging layout.
 * @param sessionId - session the upload is addressed to.
 * @param chunks - ordered byte chunks of the request body.
 * @param options - byte ceiling, cancellation, and optional intake observer.
 * @returns the committed object's size, digest, sniffed media type, and path.
 */
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
