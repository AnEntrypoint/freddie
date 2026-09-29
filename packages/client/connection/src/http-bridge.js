export const DEFAULT_MAX_REQUEST_BODY_BYTES = 300 * 1024 * 1024

export async function bridge(
  req,
  res,
  apiHandler,
  maxRequestBodyBytes = DEFAULT_MAX_REQUEST_BODY_BYTES,
) {
  const abort = new AbortController()
  abortWhenConnectionTearsDown(res, abort)
  const declaredLength = req.headers['content-length']
  if (declaredLength !== undefined && Number(declaredLength) > maxRequestBodyBytes) {
    res.writeHead(413, { connection: 'close' })
    res.end()
    req.destroy()
    return
  }
  const chunks = []
  let received = 0
  for await (const chunk of req) {
    const buffer = chunk
    received += buffer.byteLength
    if (received > maxRequestBodyBytes) {
      res.writeHead(413, { connection: 'close' })
      res.end()
      req.destroy()
      return
    }
    chunks.push(buffer)
  }
  /* v8 ignore next 3 */
  const request = new Request(new URL(req.url ?? '/', 'http://freddie.internal'), {
    method: req.method ?? 'GET',
    headers: Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string')),
    ...chunks.length > 0 ? { body: Buffer.concat(chunks) } : {},
    signal: abort.signal,
  })
  const response = await apiHandler.fetch(request)
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()))
  if (response.body === null) {
    res.end()
    return
  }
  for await (const chunk of response.body) {
    const socketBufferIsFull = !res.write(chunk)
    if (socketBufferIsFull) await drainedOrClosed(res)
  }
  res.end()
}

function abortWhenConnectionTearsDown(res, abort) {
  res.on('close', () => {
    if (!res.writableEnded) abort.abort()
  })
}

function drainedOrClosed(res) {
  return new Promise((resolve) => {
    const done = () => {
      res.off('drain', done)
      res.off('close', done)
      resolve()
    }
    res.once('drain', done)
    res.once('close', done)
  })
}
