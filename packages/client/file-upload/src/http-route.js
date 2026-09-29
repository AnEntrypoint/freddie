import { isTrustedApiRequest } from '@freddie/freddie-client-connection/src/api-request-trust.js'
import { FILE_UPLOAD_TRUSTED_HOSTS, displayName } from './shared.js'

const MAX_QUERY_NAME_LENGTH = 1024

const DRAIN_GRACE_BYTES = 8 * 1024 * 1024

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

function sendMethodNotAllowed(res) {
  res.statusCode = 405
  res.setHeader('allow', 'POST')
  res.end()
}

async function* requestChunks(req) {
  for await (const chunk of req) yield chunk
}

function mediaTypeEssence(header) {
  return typeof header === 'string' ? header.split(';', 1)[0].trim().toLowerCase() : ''
}

async function drainRequest(req) {
  let seen = 0
  for await (const chunk of req) {
    seen += chunk.byteLength
    if (seen >= DRAIN_GRACE_BYTES) return
  }
}

export async function handleFileUploadHttp(service, req, res) {
  if (req.method !== 'POST') {
    sendMethodNotAllowed(res)
    return
  }
  if (!isTrustedApiRequest(req, FILE_UPLOAD_TRUSTED_HOSTS)) {
    res.writeHead(403)
    res.end('forbidden')
    return
  }
  if (mediaTypeEssence(req.headers['content-type']) !== 'application/octet-stream') {
    await drainRequest(req)
    sendJson(res, 415, {
      ok: false,
      error: { code: 'upload/unsupported-media-type', message: 'content-type must be application/octet-stream' },
    })
    return
  }

  let url
  try {
    url = new URL(String(req.url), 'http://localhost')
  } catch {
    sendJson(res, 400, { ok: false, error: { code: 'upload/invalid-request', message: 'request URL is unparsable' } })
    return
  }
  const sessionId = url.searchParams.get('sessionId')
  if (sessionId === null || sessionId === '') {
    await drainRequest(req)
    sendJson(res, 400, { ok: false, error: { code: 'upload/invalid-session', message: 'sessionId is required' } })
    return
  }
  const rawName = url.searchParams.get('name')
  const displayOnlyName = rawName === null ? undefined : displayName(rawName.slice(0, MAX_QUERY_NAME_LENGTH))

  const controller = new AbortController()
  const onAborted = () => {
    controller.abort(new DOMException('The upload intake was cancelled.', 'AbortError'))
  }
  req.on('aborted', onAborted)
  try {
    const value = await service.uploadStream({
      sessionId,
      data: requestChunks(req),
      signal: controller.signal,
      ...(displayOnlyName === undefined ? {} : { name: displayOnlyName }),
    })
    sendJson(res, 200, { ok: true, value })
  } catch (error) {
    const clientAlreadyGone = controller.signal.aborted
    if (clientAlreadyGone) {
      res.destroy()
      return
    }
    const failure = error instanceof Error ? error : undefined
    const code = typeof failure?.code === 'string' ? failure.code : 'upload/internal'
    const status = typeof failure?.status === 'number' ? failure.status : 500
    await drainRequest(req)
    sendJson(res, status, {
      ok: false,
      error: { code, message: failure?.message ?? 'failed to store file upload' },
    })
  } finally {
    req.off('aborted', onAborted)
  }
}
