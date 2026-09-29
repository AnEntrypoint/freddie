/**
 * Browser background-upload service (`ctx.fileUpload`).
 *
 * One carrier is chosen once, before Cordis boots: a page that owns its Host
 * transport installs `__FREDDIE_FILE_UPLOAD__` and supplies a Fetch-shaped
 * carrier; every other page gets a short-lived dedicated Worker, released
 * after completion, failure, or cancellation.
 * @module @freddie/freddie-client-file-upload/client
 */

import { Service } from '@freddie/cordis'
import { progressStream } from './progress.js'
import { FILE_UPLOAD_ROUTE, displayName } from '../shared.js'
import { fileUploadWorker } from './worker.js'

/** Name of the pre-Cordis hook a page owning the Host transport installs. */
export const FILE_UPLOAD_HOOK = '__FREDDIE_FILE_UPLOAD__'

/** Carrier installed by a page that owns its Host transport. */
function customTransport(customFetch) {
  return {
    async post(request) {
      const init = {
        method: 'POST',
        ...(request.headers === undefined ? {} : { headers: request.headers }),
        body: request.body,
        ...(request.body instanceof ReadableStream ? { duplex: 'half' } : {}),
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      }
      const response = await customFetch(request.path, init)
      return { status: response.status, body: await response.text() }
    },
  }
}

/** Carrier owning one dedicated Worker per upload operation. */
function workerTransport() {
  return {
    post(request) {
      if (typeof Worker !== 'function') {
        return Promise.reject(new Error('background upload requires Web Worker support'))
      }
      const workerUrl = URL.createObjectURL(new Blob([`(${fileUploadWorker.toString()})()`], {
        type: 'text/javascript',
      }))
      const worker = new Worker(workerUrl, { name: 'freddie-file-upload' })
      URL.revokeObjectURL(workerUrl)
      return new Promise((resolve, reject) => {
        let settled = false
        const abort = () => {
          settled = true
          worker.terminate()
          request.signal?.removeEventListener('abort', abort)
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        }
        const finish = (settle) => {
          if (settled) return
          settled = true
          request.signal?.removeEventListener('abort', abort)
          worker.terminate()
          settle()
        }
        worker.onmessage = (event) => {
          const output = event.data
          if (output.kind === 'progress') {
            request.onProgress?.({
              loaded: output.loaded,
              ...(output.total === undefined ? {} : { total: output.total }),
            })
          } else if (output.kind === 'complete') {
            finish(() => {
              resolve({ status: output.status, body: output.body })
            })
          } else {
            finish(() => {
              reject(new Error(output.message))
            })
          }
        }
        worker.onerror = (event) => {
          finish(() => {
            reject(new Error(event.message || 'background upload worker failed'))
          })
        }
        if (request.signal?.aborted === true) {
          abort()
          return
        }
        request.signal?.addEventListener('abort', abort, { once: true })
        const message = {
          url: absoluteUrlForBlobWorker(request.path),
          body: request.body,
          headers: request.headers ?? {},
        }
        postTransferringStreamBody(worker, message)
      })
    },
  }
}

/** Absolute URL of a route path, resolved against the page. */
function absoluteUrlForBlobWorker(path) {
  return new URL(path, document.baseURI).href
}

/** Post the message, transferring a stream body to the Worker. */
function postTransferringStreamBody(worker, message) {
  if (message.body instanceof ReadableStream) worker.postMessage(message, [message.body])
  else worker.postMessage(message)
}

/**
 * Session-addressed browser upload service.
 */
export class FileUploadRuntime extends Service {
  /** @param ctx - browser plugin context. */
  constructor(ctx) {
    super(ctx, 'fileUpload')
    const hook = globalThis[FILE_UPLOAD_HOOK]
    this.transport = typeof hook?.fetch === 'function'
      ? customTransport(hook.fetch)
      : workerTransport()
  }

  /**
   * Post one body with the carrier selected before Cordis boot.
   * @param request - target, body, cancellation, and progress observer.
   * @returns the response status and text body.
   */
  post(request) {
    return this.transport.post(request)
  }

  /**
   * Store one file for a Session.
   *
   * A `Blob` reports browser upload progress (with a total when the browser
   * provides one); a `ReadableStream` reports consumed bytes with no total,
   * because the stream API carries no length. Exact bytes are sent the same
   * way — this port has no base64 Remote fallback, so nothing expands by 4/3
   * on the way out.
   *
   * @param sessionId - Session that owns the staged receipt.
   * @param data - browser Blob, exact bytes, or a one-shot byte stream.
   * @param name - optional display name; sanitized and never used as a path.
   * @param signal - optional cancellation for the active upload.
   * @param onProgress - optional byte-progress observer.
   * @returns the staged receipt and durable file description, or a business error.
   */
  async upload(sessionId, data, name, signal, onProgress) {
    const query = new URLSearchParams({ sessionId })
    const display = displayName(name)
    if (display !== undefined) query.set('name', display)
    const body = sendableBody(data, onProgress)
    let response
    try {
      response = await this.post({
        path: `${FILE_UPLOAD_ROUTE}?${query.toString()}`,
        body,
        headers: { 'content-type': 'application/octet-stream' },
        ...(signal === undefined ? {} : { signal }),
        ...(onProgress === undefined ? {} : { onProgress }),
      })
    } catch (error) {
      throw cancellationOverTransportError(error, signal)
    }
    if (response.status !== 200) {
      throw new Error(`file upload transport failed with HTTP ${String(response.status)}`)
    }
    return parseFileUploadResult(response.body)
  }
}

/** The cancellation the caller asked for when its signal aborted, otherwise the transport error. */
function cancellationOverTransportError(error, signal) {
  return signal?.aborted === true ? new DOMException('The file upload was cancelled.', 'AbortError') : error
}

/** Normalize one caller body and attach the shared progress tap to a stream. */
function sendableBody(data, onProgress) {
  const body = data instanceof Uint8Array ? new Blob([data]) : data
  if (!(body instanceof ReadableStream) || onProgress === undefined) return body
  return progressStream(body, onProgress)
}

/** Decode one route result, or throw the business error it carries. */
function parseFileUploadResult(text) {
  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw new TypeError('file upload transport returned an invalid result')
  }
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    throw new TypeError('file upload transport returned an invalid result')
  }
  if (!value.ok) {
    const error = value.error
    if (!isRecord(error) || typeof error.code !== 'string' || typeof error.message !== 'string') {
      throw new TypeError('file upload transport returned an invalid failure')
    }
    throw Object.assign(new Error(error.message), { code: error.code })
  }
  const result = value.value
  const file = isRecord(result) ? result.file : undefined
  if (!isRecord(result) || typeof result.receiptId !== 'string' || !isRecord(file)
    || typeof file.mediaType !== 'string' || typeof file.sha256 !== 'string'
    || typeof file.bytes !== 'number' || !Number.isSafeInteger(file.bytes) || file.bytes < 0) {
    throw new TypeError('file upload transport returned an invalid receipt')
  }
  return {
    receiptId: result.receiptId,
    file: {
      bytes: file.bytes,
      mediaType: file.mediaType,
      sha256: file.sha256,
      ...(typeof file.name !== 'string' ? {} : { name: file.name }),
    },
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
